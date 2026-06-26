export const ADMIN_PERMISSIONS = [
  "admin.view",
  "admin.manage_users",
  "admin.manage_roles",
  "admin.manage_permissions",
  "licenses.view",
  "licenses.issue",
  "licenses.disable",
  "licenses.rebind_hwid",
  "gifts.create",
  "gifts.revoke",
  "macros.view",
  "macros.create",
  "macros.edit",
  "macros.delete",
  "macros.publish",
  "macros.update_official",
  "macros.save_all",
  "macros.export",
  "creator.review",
  "feedback.moderate",
  "tickets.view",
  "tickets.manage",
  "security.view_logs",
  "security.rotate_secrets",
  "settings.manage_app",
  "release.prepare",
  "release.publish"
];

export const ADMIN_PERMISSION_GROUPS = {
  admin: ["admin.view", "admin.manage_users", "admin.manage_roles", "admin.manage_permissions"],
  licenses: ["licenses.view", "licenses.issue", "licenses.disable", "licenses.rebind_hwid"],
  gifts: ["gifts.create", "gifts.revoke"],
  macros: ["macros.view", "macros.create", "macros.edit", "macros.delete", "macros.publish", "macros.update_official", "macros.save_all", "macros.export"],
  community: ["creator.review", "feedback.moderate", "tickets.view", "tickets.manage"],
  security: ["security.view_logs", "security.rotate_secrets"],
  settings: ["settings.manage_app", "release.prepare", "release.publish"]
};

export const ADMIN_ROLES = {
  owner: {
    label: "Owner",
    permissions: ADMIN_PERMISSIONS,
    locked: true,
    description: "Full control. Cannot be removed through normal admin UI."
  },
  super_admin: {
    label: "Super Admin",
    permissions: ADMIN_PERMISSIONS.filter((permission) => permission !== "admin.manage_permissions" && permission !== "release.publish"),
    description: "Operational control without owner-only permission management."
  },
  admin: {
    label: "Admin",
    permissions: [
      "admin.view",
      "admin.manage_users",
      "licenses.view",
      "licenses.issue",
      "licenses.disable",
      "licenses.rebind_hwid",
      "gifts.create",
      "gifts.revoke",
      "macros.view",
      "macros.edit",
      "creator.review",
      "feedback.moderate",
      "tickets.view",
      "tickets.manage",
      "security.view_logs",
      "settings.manage_app"
    ],
    description: "Daily operations for users, licenses, gifts, tickets and moderation."
  },
  macro_editor: {
    label: "Macro Editor",
    permissions: ["admin.view", "macros.view", "macros.create", "macros.edit", "macros.export"],
    deniedByDefault: ["macros.update_official", "macros.save_all", "macros.delete", "macros.publish"],
    description: "Can edit sandboxed macro drafts. Cannot delete, publish, update official macros or Save All by default."
  },
  support_staff: {
    label: "Support Staff",
    permissions: ["admin.view", "licenses.view", "tickets.view", "tickets.manage", "feedback.moderate"],
    description: "Support tickets and masked license lookup."
  },
  moderator: {
    label: "Moderator",
    permissions: ["admin.view", "creator.review", "feedback.moderate", "tickets.view"],
    description: "Community review and feedback moderation."
  },
  viewer: {
    label: "Viewer",
    permissions: ["admin.view", "licenses.view", "macros.view", "tickets.view"],
    description: "Read-only masked admin access."
  }
};

export const DANGEROUS_ADMIN_PERMISSIONS = new Set([
  "admin.manage_roles",
  "admin.manage_permissions",
  "licenses.disable",
  "licenses.rebind_hwid",
  "gifts.revoke",
  "macros.delete",
  "macros.update_official",
  "macros.save_all",
  "security.rotate_secrets",
  "release.publish"
]);

export function adminRbacSummary() {
  return {
    roles: Object.entries(ADMIN_ROLES).map(([id, role]) => ({
      id,
      label: role.label,
      description: role.description,
      locked: Boolean(role.locked),
      permissions: role.permissions,
      deniedByDefault: role.deniedByDefault || []
    })),
    permissions: ADMIN_PERMISSIONS.map((permission) => ({
      id: permission,
      group: Object.entries(ADMIN_PERMISSION_GROUPS).find(([, values]) => values.includes(permission))?.[0] || "other",
      dangerous: DANGEROUS_ADMIN_PERMISSIONS.has(permission)
    })),
    groups: ADMIN_PERMISSION_GROUPS,
    enforcement: {
      current: "role_model_defined_backend_endpoint_added",
      nextRequired: "persist per-user role assignments and overrides in DB, then wrap mutating admin routes with requirePermission(permission)"
    },
    security: {
      ownerLockoutProtectedByPolicy: true,
      keyTextAloneGrantsAdmin: false,
      fullEmailsKeysHwidsReturned: false
    }
  };
}
