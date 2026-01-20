class Roles {
  static const String staff = "STAFF";
  static const String admin = "ADMIN";
  static const String superAdmin = "SUPER_ADMIN";
}

enum ActionPermission {
  view,
  create,
  edit,
  approve,
}

class AccessControl {
  static bool can(String role, ActionPermission action) {
    switch (role) {
      case Roles.staff:
        return action == ActionPermission.view ||
            action == ActionPermission.create ||
            action == ActionPermission.edit;

      case Roles.admin:
        return true;

      case Roles.superAdmin:
        return action == ActionPermission.view;

      default:
        return action == ActionPermission.view;
    }
  }
}
