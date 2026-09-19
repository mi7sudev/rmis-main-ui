// =============================================================================
// RMIS — Profile View: state + handlers hook
// Extracted from profile-view.tsx (pure mechanical refactor — no behavior change)
// Holds all the data-fetching / mutation logic so profile-view.tsx stays thin.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import type { DocumentUploadResponse } from "@/lib/wire";
import { toast } from "sonner";
import {
  Profile,
  EducationItem,
  WorkItem,
  TrainingItem,
  EligibilityItem,
  AwardItem,
  DocumentItem,
  ReferenceData,
  SectionId,
  toISODate,
  parseCharRefs,
  cleanCharRefs,
  isPendingId,
} from "./types";

// AI extraction is owned exclusively by the PDS Upload · Auto-Extraction strip
// (upload-pds-card.tsx: upload → extract → auto-apply). Section 7 (Supporting
// Documents) is STORAGE-ONLY by design — uploads there are never auto-extracted.

export function useProfileData() {
  // Session refresh handle — profile mutations change data the SESSION also
  // carries (isProfileComplete gates the home banner + the apply gate), so
  // every successful mutation re-syncs the session immediately. Without this
  // the applicant home keeps showing "Complete Your Profile" until a manual
  // reload, because the session store outlives view navigation and never
  // re-fetched on its own.
  const { refresh: refreshSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("personal");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reference, setReference] = useState<ReferenceData | null>(null);

  // Personal info form state
  const [personalForm, setPersonalForm] = useState<Record<string, string | boolean | null>>({});
  const [personalDirty, setPersonalDirty] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  // Google-Forms-style autosave state — surfaced as a quiet indicator in the
  // Personal Information header ("Autosaving… / Autosaved / failed").
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  // Latest form snapshot for the autosave effect (avoids stale closures and
  // lets an in-flight save detect keystrokes that happened while it ran).
  const personalFormRef = useRef(personalForm);
  useEffect(() => {
    personalFormRef.current = personalForm;
  }, [personalForm]);

  // Sub-entity local lists
  const [educations, setEducations] = useState<EducationItem[]>([]);
  const [workExperiences, setWorkExperiences] = useState<WorkItem[]>([]);
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [eligibilities, setEligibilities] = useState<EligibilityItem[]>([]);
  const [awards, setAwards] = useState<AwardItem[]>([]);

  // Mark complete dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  const loadAll = useCallback(async (silent?: boolean) => {
    // `silent` = true for background refreshes (e.g. after auto-apply) — skips
    // the full-page loading skeleton so the UploadPdsCard's "done" state
    // (showing the override summary + replaced badges) stays visible instead
    // of being unmounted and lost.
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [profileData, refData, docsData] = await Promise.all([
        apiFetch<Profile>("/api/applicant/profile"),
        apiFetch<ReferenceData>("/api/reference"),
        apiFetch<DocumentItem[]>("/api/applicant/documents").catch(() => [] as DocumentItem[]),
      ]);
      setProfile(profileData);
      setDocuments(docsData);
      setReference(refData);
      setEducations(profileData.educations || []);
      setWorkExperiences(profileData.workExperiences || []);
      setTrainings(profileData.trainings || []);
      setEligibilities(profileData.eligibilities || []);
      setAwards(profileData.awards || []);
      // initialize personal form
      setPersonalForm({
        firstName: profileData.firstName ?? "",
        middleName: profileData.middleName ?? "",
        lastName: profileData.lastName ?? "",
        extensionName: profileData.extensionName ?? "",
        emailAddress: profileData.emailAddress ?? "",
        mobileNumber: profileData.mobileNumber ?? "",
        contactNumber: profileData.contactNumber ?? "",
        birthDate: toISODate(profileData.birthDate) ?? "",
        birthPlace: profileData.birthPlace ?? "",
        gender: profileData.gender ?? "",
        civilStatus: profileData.civilStatus ?? "",
        citizenship: profileData.citizenship ?? "",
        religion: profileData.religion ?? "",
        isPwd: profileData.isPwd ?? false,
        ethnicity: profileData.ethnicity ?? "",
        presentAddress: profileData.presentAddress ?? "",
        city: profileData.city ?? "",
        province: profileData.province ?? "",
        country: profileData.country ?? "",
        zipCode: profileData.zipCode ?? "",
        adminCase: profileData.adminCase ?? false,
        adminCaseDetails: profileData.adminCaseDetails ?? "",
        crimeCharge: profileData.crimeCharge ?? false,
        crimeDate: toISODate(profileData.crimeDate) ?? "",
        crimeCaseStatus: profileData.crimeCaseStatus ?? "",
        characterReferences:
          profileData.characterReferences ?? "[]",
      });
      setPersonalDirty(false);
      setAutosaveStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ----- Completion calculation (7 sections) -----
  const completion = useMemo(() => {
    const checks: Record<SectionId, boolean> = {
      personal:
        !!personalForm.firstName &&
        !!personalForm.lastName &&
        !!personalForm.emailAddress &&
        (!personalDirty || true), // personal section is "present" if form has core fields
      education: educations.length > 0,
      work: workExperiences.length > 0,
      training: trainings.length > 0,
      eligibility: eligibilities.length > 0,
      awards: awards.length > 0,
      documents: documents.length > 0,
    };
    const filled = Object.values(checks).filter(Boolean).length;
    return { filled, total: 7, percent: Math.round((filled / 7) * 100), checks };
  }, [personalForm, educations, workExperiences, trainings, eligibilities, awards, documents]);

  const canMarkComplete =
    !!personalForm.firstName &&
    !!personalForm.lastName &&
    !!personalForm.emailAddress &&
    educations.length > 0 &&
    workExperiences.length > 0;

  // ----- Personal info handlers -----
  function updatePersonalField(key: string, value: string | boolean | null) {
    setPersonalForm((prev) => ({ ...prev, [key]: value }));
    setPersonalDirty(true);
  }

  /**
   * Serialize the personal form into the PUT /api/applicant/profile payload.
   * Shared by the manual Save button AND the debounced autosave so both
   * paths always write identical data.
   */
  function buildPersonalData(
    form: Record<string, string | boolean | null>
  ): Record<string, unknown> {
    return {
      firstName: form.firstName || null,
      middleName: form.middleName || null,
      lastName: form.lastName || null,
      extensionName: form.extensionName || null,
      emailAddress: form.emailAddress || null,
      mobileNumber: form.mobileNumber || null,
      contactNumber: form.contactNumber || null,
      birthDate: form.birthDate || null,
      birthPlace: form.birthPlace || null,
      gender: form.gender || null,
      civilStatus: form.civilStatus || null,
      citizenship: form.citizenship || null,
      religion: form.religion || null,
      isPwd: !!form.isPwd,
      ethnicity: form.ethnicity || null,
      presentAddress: form.presentAddress || null,
      city: form.city || null,
      province: form.province || null,
      country: form.country || null,
      zipCode: form.zipCode || null,
      adminCase: !!form.adminCase,
      adminCaseDetails: form.adminCase ? form.adminCaseDetails || null : null,
      crimeCharge: !!form.crimeCharge,
      crimeDate: form.crimeCharge ? form.crimeDate || null : null,
      crimeCaseStatus: form.crimeCharge ? form.crimeCaseStatus || null : null,
      // Filter out empty character references (cards the user added but
      // never filled in) at SAVE time — not on every keystroke, or else
      // the "Add Reference" button would be a no-op (a freshly-added ref
      // has an empty name and would be silently dropped from state).
      characterReferences: JSON.stringify(
        cleanCharRefs(
          parseCharRefs(
            typeof form.characterReferences === "string"
              ? form.characterReferences
              : null
          )
        )
      ),
    };
  }

  async function savePersonal() {
    setSavingPersonal(true);
    try {
      const updated = await apiFetch<Profile>("/api/applicant/profile", {
        method: "PUT",
        body: JSON.stringify({ data: buildPersonalData(personalForm) }),
      });
      setProfile(updated);
      setPersonalDirty(false);
      setAutosaveStatus("saved");
      // Sync the session snapshot (applicant name/email/completeness) so
      // session-driven surfaces stay truthful the moment navigation happens.
      void refreshSession();
      toast.success("Personal information saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save personal info");
    } finally {
      setSavingPersonal(false);
    }
  }

  // ----- Autosave (Google-Forms-style) -----
  // Every personal-info edit re-arms a 1.2s debounce; when the keystrokes
  // settle, the form persists silently. No "Save as draft" button needed —
  // the profile IS the draft until "Mark Complete" finalizes it, and the
  // section entities (education/work/training/eligibility/awards) already
  // persist the instant their dialogs are saved.
  useEffect(() => {
    if (!personalDirty) return;
    const snapshot = personalFormRef.current;
    const timer = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        const updated = await apiFetch<Profile>("/api/applicant/profile", {
          method: "PUT",
          body: JSON.stringify({ data: buildPersonalData(snapshot) }),
        });
        setProfile(updated);
        // Clear the dirty flag ONLY if the user didn't type while this save
        // was in flight — otherwise the newer keystrokes re-arm the effect
        // and save again (never marking unsaved edits as persisted).
        if (personalFormRef.current === snapshot) {
          setPersonalDirty(false);
          setAutosaveStatus("saved");
          void refreshSession();
        }
      } catch {
        // Quiet failure — the indicator flips to "error" and keeps the form
        // dirty, so the manual Save button remains the explicit retry path.
        setAutosaveStatus("error");
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [personalForm, personalDirty, refreshSession]);

  // ----- Sub-entity helpers (CRUD via API) -----
  async function createSubEntity<T>(
    endpoint: string,
    payload: Record<string, unknown>,
    label: string
  ): Promise<T | null> {
    try {
      const item = await apiFetch<T>(endpoint, {
        method: "POST",
        body: JSON.stringify({ data: payload }),
      });
      toast.success(`${label} added`);
      return item;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to add ${label.toLowerCase()}`);
      return null;
    }
  }

  async function deleteSubEntity(endpoint: string, label: string): Promise<boolean> {
    try {
      await apiFetch<{ deleted: true }>(endpoint, { method: "DELETE" });
      toast.success(`${label} removed`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to delete ${label.toLowerCase()}`);
      return false;
    }
  }

  async function handleMarkComplete() {
    setMarkingComplete(true);
    try {
      const updated = await apiFetch<Profile>("/api/applicant/profile", {
        method: "PUT",
        body: JSON.stringify({ data: { isProfileComplete: true } }),
      });
      setProfile(updated);
      // THE FIX for the stale "Complete Your Profile" banner: the banner and
      // the apply gate read `user.applicant.isProfileComplete` from the
      // session store, which used to be fetched once at boot and never again.
      // Re-sync the session BEFORE closing the dialog so the very next
      // navigation (Home, Positions) renders the completed state — no reload.
      await refreshSession();
      setCompleteOpen(false);
      toast.success("Profile marked complete! You can now apply for jobs.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark profile complete");
    } finally {
      setMarkingComplete(false);
    }
  }

  // ----- Refresh documents after upload/delete -----
  async function reloadDocuments() {
    try {
      const docs = await apiFetch<DocumentItem[]>("/api/applicant/documents");
      setDocuments(docs);
    } catch {
      /* silent */
    }
  }

  // ----- Section handler bundles (pre-built so the view stays thin) -----
  const educationHandlers = {
    onCreate: async (payload: Record<string, unknown>) => {
      const item = await createSubEntity<EducationItem>(
        "/api/applicant/educations",
        payload,
        "Education"
      );
      if (item) {
        setEducations((prev) => [
          { ...item, __fromExtraction: false },
          ...prev,
        ]);
      }
      return item;
    },
    onUpdate: async (id: string, payload: Record<string, unknown>) => {
      // edit = delete + create (no PUT endpoint)
      const okDel = await deleteSubEntity(
        `/api/applicant/educations/${id}`,
        "Education"
      );
      if (!okDel) return false;
      const created = await createSubEntity<EducationItem>(
        "/api/applicant/educations",
        payload,
        "Education"
      );
      if (created) {
        setEducations((prev) => [
          { ...created, __fromExtraction: false },
          ...prev.filter((e) => e.id !== id),
        ]);
        return true;
      }
      return false;
    },
    onDelete: async (id: string) => {
      if (isPendingId(id)) {
        setEducations((prev) => prev.filter((e) => e.id !== id));
        toast.success("Education removed");
        return;
      }
      const okDel = await deleteSubEntity(
        `/api/applicant/educations/${id}`,
        "Education"
      );
      if (okDel) setEducations((prev) => prev.filter((e) => e.id !== id));
    },
  };

  const workHandlers = {
    onCreate: async (payload: Record<string, unknown>) => {
      const item = await createSubEntity<WorkItem>(
        "/api/applicant/work-experiences",
        payload,
        "Work Experience"
      );
      if (item) {
        setWorkExperiences((prev) => [
          { ...item, __fromExtraction: false },
          ...prev,
        ]);
      }
      return item;
    },
    onUpdate: async (id: string, payload: Record<string, unknown>) => {
      const okDel = await deleteSubEntity(
        `/api/applicant/work-experiences/${id}`,
        "Work Experience"
      );
      if (!okDel) return false;
      const created = await createSubEntity<WorkItem>(
        "/api/applicant/work-experiences",
        payload,
        "Work Experience"
      );
      if (created) {
        setWorkExperiences((prev) => [
          { ...created, __fromExtraction: false },
          ...prev.filter((e) => e.id !== id),
        ]);
        return true;
      }
      return false;
    },
    onDelete: async (id: string) => {
      if (isPendingId(id)) {
        setWorkExperiences((prev) => prev.filter((e) => e.id !== id));
        toast.success("Work experience removed");
        return;
      }
      const okDel = await deleteSubEntity(
        `/api/applicant/work-experiences/${id}`,
        "Work Experience"
      );
      if (okDel) setWorkExperiences((prev) => prev.filter((e) => e.id !== id));
    },
  };

  const trainingHandlers = {
    onCreate: async (payload: Record<string, unknown>) => {
      const item = await createSubEntity<TrainingItem>(
        "/api/applicant/trainings",
        payload,
        "Training"
      );
      if (item) {
        setTrainings((prev) => [
          { ...item, __fromExtraction: false },
          ...prev,
        ]);
      }
      return item;
    },
    onUpdate: async (id: string, payload: Record<string, unknown>) => {
      const okDel = await deleteSubEntity(
        `/api/applicant/trainings/${id}`,
        "Training"
      );
      if (!okDel) return false;
      const created = await createSubEntity<TrainingItem>(
        "/api/applicant/trainings",
        payload,
        "Training"
      );
      if (created) {
        setTrainings((prev) => [
          { ...created, __fromExtraction: false },
          ...prev.filter((e) => e.id !== id),
        ]);
        return true;
      }
      return false;
    },
    onDelete: async (id: string) => {
      if (isPendingId(id)) {
        setTrainings((prev) => prev.filter((e) => e.id !== id));
        toast.success("Training removed");
        return;
      }
      const okDel = await deleteSubEntity(
        `/api/applicant/trainings/${id}`,
        "Training"
      );
      if (okDel) setTrainings((prev) => prev.filter((e) => e.id !== id));
    },
  };

  const eligibilityHandlers = {
    onCreate: async (payload: Record<string, unknown>) => {
      const item = await createSubEntity<EligibilityItem>(
        "/api/applicant/eligibilities",
        payload,
        "Eligibility"
      );
      if (item) {
        setEligibilities((prev) => [
          { ...item, __fromExtraction: false },
          ...prev,
        ]);
      }
      return item;
    },
    onUpdate: async (id: string, payload: Record<string, unknown>) => {
      const okDel = await deleteSubEntity(
        `/api/applicant/eligibilities/${id}`,
        "Eligibility"
      );
      if (!okDel) return false;
      const created = await createSubEntity<EligibilityItem>(
        "/api/applicant/eligibilities",
        payload,
        "Eligibility"
      );
      if (created) {
        setEligibilities((prev) => [
          { ...created, __fromExtraction: false },
          ...prev.filter((e) => e.id !== id),
        ]);
        return true;
      }
      return false;
    },
    onDelete: async (id: string) => {
      if (isPendingId(id)) {
        setEligibilities((prev) => prev.filter((e) => e.id !== id));
        toast.success("Eligibility removed");
        return;
      }
      const okDel = await deleteSubEntity(
        `/api/applicant/eligibilities/${id}`,
        "Eligibility"
      );
      if (okDel) setEligibilities((prev) => prev.filter((e) => e.id !== id));
    },
  };

  const awardsHandlers = {
    onCreate: async (payload: Record<string, unknown>) => {
      const item = await createSubEntity<AwardItem>(
        "/api/applicant/awards",
        payload,
        "Award"
      );
      if (item) {
        setAwards((prev) => [
          { ...item, __fromExtraction: false },
          ...prev,
        ]);
      }
      return item;
    },
    onUpdate: async (id: string, payload: Record<string, unknown>) => {
      const okDel = await deleteSubEntity(
        `/api/applicant/awards/${id}`,
        "Award"
      );
      if (!okDel) return false;
      const created = await createSubEntity<AwardItem>(
        "/api/applicant/awards",
        payload,
        "Award"
      );
      if (created) {
        setAwards((prev) => [
          { ...created, __fromExtraction: false },
          ...prev.filter((e) => e.id !== id),
        ]);
        return true;
      }
      return false;
    },
    onDelete: async (id: string) => {
      if (isPendingId(id)) {
        setAwards((prev) => prev.filter((e) => e.id !== id));
        toast.success("Award removed");
        return;
      }
      const okDel = await deleteSubEntity(
        `/api/applicant/awards/${id}`,
        "Award"
      );
      if (okDel) setAwards((prev) => prev.filter((e) => e.id !== id));
    },
  };

  const documentsHandlers = {
    onUpload: async (file: File, category: string) => {
      try {
        // apiFetch skips Content-Type for FormData — browser sets the multipart boundary.
        // Section 7 is STORAGE-ONLY by design: supporting documents are kept for HR
        // verification and never run through AI extraction. Auto-fill belongs to the
        // PDS Upload · Auto-Extraction strip at the top of the profile page.
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", category);
        await apiFetch<DocumentUploadResponse>("/api/applicant/documents", {
          method: "POST",
          body: fd,
        });
        toast.success(`${file.name} uploaded.`);
        await reloadDocuments();
      } catch (e) {
        // apiFetch folds network failures into a user-safe Error message and
        // 4xx/5xx into the seam's error policy — every failure here is already
        // display-ready (no TypeError sniffing needed).
        toast.error(
          e instanceof Error ? e.message : "Failed to upload document. Please try again."
        );
      }
    },
    onDelete: async (id: string) => {
      const ok = await deleteSubEntity(
        `/api/applicant/documents/${id}`,
        "Document"
      );
      if (ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      }
    },
  };

  return {
    loading,
    error,
    profile,
    loadAll,
    activeSection,
    setActiveSection,
    documents,
    reference,
    personalForm,
    personalDirty,
    savingPersonal,
    autosaveStatus,
    updatePersonalField,
    savePersonal,
    educations,
    workExperiences,
    trainings,
    eligibilities,
    awards,
    educationHandlers,
    workHandlers,
    trainingHandlers,
    eligibilityHandlers,
    awardsHandlers,
    documentsHandlers,
    completeOpen,
    setCompleteOpen,
    markingComplete,
    handleMarkComplete,
    completion,
    canMarkComplete,
  };
}
