"use client";

import React from "react";
import PatientDashboard from "@/frontend/components/patient/PatientDashboard";
import TechnicianPortal from "@/frontend/components/technician/TechnicianPortal";
import RadiologistWorkspace from "@/frontend/components/radiologist/RadiologistWorkspace";
import AdminDashboard from "@/frontend/components/admin/AdminDashboard";
import ReferringDoctorPortal from "@/frontend/components/referring-doctor/ReferringDoctorPortal";
import SuperAdminDashboard from "@/frontend/components/super-admin/SuperAdminDashboard";
import { useStore } from "@/frontend/lib/store";

export default function Home() {
  const { effectiveRole } = useStore();

  return (
    <>
      {effectiveRole === "patient" && <PatientDashboard />}
      {effectiveRole === "technician" && <TechnicianPortal />}
      {effectiveRole === "radiologist" && <RadiologistWorkspace />}
      {effectiveRole === "admin" && <AdminDashboard />}
      {effectiveRole === "referring_doctor" && <ReferringDoctorPortal />}
      {effectiveRole === "super_admin" && <SuperAdminDashboard />}
    </>
  );
}
