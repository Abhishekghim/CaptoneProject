"use client";

import React from "react";
import PatientDashboard from "@/components/patient/PatientDashboard";
import TechnicianPortal from "@/components/technician/TechnicianPortal";
import RadiologistWorkspace from "@/components/radiologist/RadiologistWorkspace";
import AdminDashboard from "@/components/admin/AdminDashboard";
import ReferringDoctorPortal from "@/components/referring-doctor/ReferringDoctorPortal";
import { useStore } from "@/lib/store";

export default function Home() {
  const { effectiveRole } = useStore();

  return (
    <>
      {effectiveRole === "patient" && <PatientDashboard />}
      {effectiveRole === "technician" && <TechnicianPortal />}
      {effectiveRole === "radiologist" && <RadiologistWorkspace />}
      {effectiveRole === "admin" && <AdminDashboard />}
      {effectiveRole === "referring_doctor" && <ReferringDoctorPortal />}
    </>
  );
}
