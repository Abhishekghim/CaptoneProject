"use client";

import React from "react";
import StaffDirectoryPanel from "./StaffDirectoryPanel";
import DoctorRequestsPanel from "@/frontend/components/admin/DoctorRequestsPanel";
import AdminDashboard from "@/frontend/components/admin/AdminDashboard";

// super_admin is everything admin has, plus account/role management and
// referring-doctor approval (backend/database/008_super_admin.sql moved both of
// those off the regular admin role for separation of duties). Rather than
// duplicate the KPIs/billing/equipment/inventory/reports/content/security/
// audit panels, this reuses AdminDashboard wholesale underneath the two
// super_admin-only panels.
export default function SuperAdminDashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <StaffDirectoryPanel />
      <DoctorRequestsPanel />
      <AdminDashboard />
    </div>
  );
}
