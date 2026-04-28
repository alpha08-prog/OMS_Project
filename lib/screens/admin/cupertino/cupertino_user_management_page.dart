import 'dart:convert';
import 'package:flutter/cupertino.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';

class CupertinoUserManagementPage extends StatefulWidget {
  const CupertinoUserManagementPage({super.key});

  @override
  State<CupertinoUserManagementPage> createState() =>
      _CupertinoUserManagementPageState();
}

class _CupertinoUserManagementPageState
    extends State<CupertinoUserManagementPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _users = [];

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  Future<void> _fetchUsers() async {
    setState(() => _loading = true);
    try {
      final res = await HttpService.get("/api/auth/users");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _users = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _changeRole(String userId, String currentRole) async {
    final roles = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: const Text("Change Role"),
        actions: roles.map((role) {
          final isCurrent = role == currentRole;
          return CupertinoActionSheetAction(
            onPressed: () async {
              Navigator.pop(ctx);
              if (isCurrent) return;

              final res = await HttpService.patch(
                  "/api/auth/users/$userId/role", {"role": role});
              if (res.statusCode == 200) {
                if (mounted) {
                  CupertinoToast.show(context, "Role updated to $role");
                }
                _fetchUsers();
              } else {
                String msg = "Failed";
                try {
                  msg = jsonDecode(res.body)["message"] ?? msg;
                } catch (_) {}
                if (mounted) {
                  CupertinoToast.show(context, msg, isError: true);
                }
              }
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (isCurrent)
                  const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(CupertinoIcons.checkmark,
                        size: 18, color: AppTheme.primaryIndigo),
                  ),
                Text(
                  role.replaceAll('_', ' '),
                  style: TextStyle(
                    fontWeight:
                        isCurrent ? FontWeight.bold : FontWeight.normal,
                    color: isCurrent
                        ? AppTheme.primaryIndigo
                        : CupertinoColors.label,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(ctx),
          child: const Text("Cancel"),
        ),
      ),
    );
  }

  Future<void> _deactivateUser(String userId, String name) async {
    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Deactivate User"),
        content: Text("Are you sure you want to deactivate $name?"),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Deactivate"),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    final res =
        await HttpService.patch("/api/auth/users/$userId/deactivate", {});
    if (res.statusCode == 200) {
      if (mounted) CupertinoToast.show(context, "User deactivated");
      _fetchUsers();
    } else {
      String msg = "Failed";
      try {
        msg = jsonDecode(res.body)["message"] ?? msg;
      } catch (_) {}
      if (mounted) CupertinoToast.show(context, msg, isError: true);
    }
  }

  Color _roleColor(String role) {
    switch (role) {
      case 'SUPER_ADMIN':
        return CupertinoColors.systemPurple;
      case 'ADMIN':
        return CupertinoColors.activeBlue;
      case 'STAFF':
        return CupertinoColors.systemGreen;
      default:
        return CupertinoColors.systemGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("User Management"),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: _fetchUsers,
          child: const Icon(CupertinoIcons.refresh,
              color: CupertinoColors.white),
        ),
      ),
      child: _loading
          ? const Center(child: CupertinoActivityIndicator())
          : CustomScrollView(
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _fetchUsers),
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (_, i) => _buildUserCard(_users[i]),
                      childCount: _users.length,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildUserCard(Map<String, dynamic> user) {
    final role = user["role"] ?? "STAFF";
    final isActive = user["isActive"] != false;
    final name = user["name"] ?? "-";

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
        border: !isActive
            ? Border.all(color: const Color(0xFFEF9A9A))
            : null,
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: isActive
                  ? _roleColor(role).withOpacity(0.1)
                  : CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(22),
            ),
            child: Icon(
              CupertinoIcons.person,
              color: isActive ? _roleColor(role) : CupertinoColors.systemGrey,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(name,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: isActive
                                ? AppTheme.foreground
                                : CupertinoColors.systemGrey,
                          )),
                    ),
                    if (!isActive) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFEBEE),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text("INACTIVE",
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFC62828))),
                      ),
                    ],
                  ],
                ),
                Text(user["email"] ?? "-",
                    style: TextStyle(
                        fontSize: 12, color: CupertinoColors.systemGrey)),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: _roleColor(role).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(role.replaceAll('_', ' '),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: _roleColor(role))),
                ),
              ],
            ),
          ),
          CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: () {
              showCupertinoModalPopup(
                context: context,
                builder: (ctx) => CupertinoActionSheet(
                  actions: [
                    CupertinoActionSheetAction(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _changeRole(user["id"], role);
                      },
                      child: const Text("Change Role"),
                    ),
                    if (isActive)
                      CupertinoActionSheetAction(
                        isDestructiveAction: true,
                        onPressed: () {
                          Navigator.pop(ctx);
                          _deactivateUser(user["id"], name);
                        },
                        child: const Text("Deactivate"),
                      ),
                  ],
                  cancelButton: CupertinoActionSheetAction(
                    isDefaultAction: true,
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text("Cancel"),
                  ),
                ),
              );
            },
            child: Icon(CupertinoIcons.ellipsis_vertical,
                color: CupertinoColors.systemGrey),
          ),
        ],
      ),
    );
  }
}
