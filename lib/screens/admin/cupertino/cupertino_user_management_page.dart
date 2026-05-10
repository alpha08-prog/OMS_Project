import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoUserManagementPage extends StatefulWidget {
  const CupertinoUserManagementPage({super.key});

  @override
  State<CupertinoUserManagementPage> createState() =>
      _CupertinoUserManagementPageState();
}

class _CupertinoUserManagementPageState
    extends State<CupertinoUserManagementPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _filteredUsers = [];

  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _roleFilter = 'ALL';

  static const List<String> _roles = ['ALL', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchUsers() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await HttpService.get("/api/auth/users");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _users = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
        _applyFilters();
      } else {
        _error = "Failed to load users (${res.statusCode})";
      }
    } catch (_) {
      _error = "Network error. Please try again.";
    }
    if (mounted) setState(() => _loading = false);
  }

  void _applyFilters() {
    List<Map<String, dynamic>> result = List.from(_users);

    if (_roleFilter != 'ALL') {
      result = result.where((u) => u['role'] == _roleFilter).toList();
    }

    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      result = result.where((u) {
        final name = (u['name'] ?? '').toString().toLowerCase();
        final email = (u['email'] ?? '').toString().toLowerCase();
        return name.contains(q) || email.contains(q);
      }).toList();
    }

    setState(() => _filteredUsers = result);
  }

  int get _totalCount => _users.length;
  int get _staffCount => _users.where((u) => u['role'] == 'STAFF').length;
  int get _adminCount => _users.where((u) => u['role'] == 'ADMIN').length;
  int get _superAdminCount =>
      _users.where((u) => u['role'] == 'SUPER_ADMIN').length;
  int get _activeCount =>
      _users.where((u) => u['isActive'] != false).length;
  int get _inactiveCount => _totalCount - _activeCount;

  Future<void> _changeRole(String userId, String currentRole) async {
    final roles = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

    final newRole = await showCupertinoModalPopup<String>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: const Text("Change User Role"),
        message: const Text("Select a new role for this user"),
        actions: roles.map((role) {
          final isCurrent = role == currentRole;
          return CupertinoActionSheetAction(
            onPressed: () => Navigator.pop(ctx, role),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (isCurrent)
                  const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(CupertinoIcons.checkmark,
                        size: 18, color: AppTheme.primaryIndigo),
                  ),
                Column(
                  children: [
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
                    Text(
                      _roleDescription(role),
                      style: const TextStyle(
                        fontSize: 11,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ],
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

    if (newRole == null || newRole == currentRole) return;

    try {
      final res = await HttpService.patch(
        "/api/auth/users/$userId/role",
        {"role": newRole},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(
            context, "Role updated to ${newRole.replaceAll('_', ' ')}");
        _fetchUsers();
      } else {
        CupertinoToast.show(context, _parseError(res.body), isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Network error. Please try again.",
            isError: true);
      }
    }
  }

  Future<void> _toggleActivation(
      String userId, String name, bool isCurrentlyActive) async {
    final action = isCurrentlyActive ? "deactivate" : "activate";
    final actionTitle = isCurrentlyActive ? "Deactivate" : "Activate";

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text("$actionTitle User"),
        content: Text(
          "Are you sure you want to $action \"$name\"?\n\n${isCurrentlyActive ? "The user will no longer be able to log in." : "The user will regain access to the system."}",
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: isCurrentlyActive,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(actionTitle),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res =
          await HttpService.patch("/api/auth/users/$userId/deactivate", {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(
          context,
          "User ${isCurrentlyActive ? "deactivated" : "activated"} successfully",
        );
        _fetchUsers();
      } else {
        CupertinoToast.show(context, _parseError(res.body), isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Network error. Please try again.",
            isError: true);
      }
    }
  }

  String _roleDescription(String role) {
    switch (role) {
      case 'STAFF':
        return 'Create records and basic access';
      case 'ADMIN':
        return 'Verify, approve, delete, and manage';
      case 'SUPER_ADMIN':
        return 'Full system access and audit logs';
      default:
        return '';
    }
  }

  String _parseError(String body) {
    try {
      return jsonDecode(body)["message"] ?? "Operation failed";
    } catch (_) {
      return "Operation failed";
    }
  }

  Color _roleColor(String role) {
    switch (role) {
      case 'SUPER_ADMIN':
        return CupertinoColors.systemPurple;
      case 'ADMIN':
        return AppTheme.primaryIndigo;
      case 'STAFF':
        return AppTheme.successGreen;
      default:
        return CupertinoColors.systemGrey;
    }
  }

  IconData _roleIcon(String role) {
    switch (role) {
      case 'SUPER_ADMIN':
        return CupertinoIcons.shield_fill;
      case 'ADMIN':
        return CupertinoIcons.person_crop_circle_badge_checkmark;
      case 'STAFF':
        return CupertinoIcons.person_fill;
      default:
        return CupertinoIcons.person;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: "User Management",
            showBack: false,
            trailing: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _fetchUsers,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CupertinoActivityIndicator(radius: 14))
                : _error != null
                    ? _buildErrorView()
                    : CustomScrollView(
                        physics: const BouncingScrollPhysics(
                            parent: AlwaysScrollableScrollPhysics()),
                        slivers: [
                          CupertinoSliverRefreshControl(onRefresh: _fetchUsers),
                          SliverPadding(
                            padding: const EdgeInsets.all(16),
                            sliver: SliverList(
                              delegate: SliverChildListDelegate([
                                _buildStatsRow(),
                                const SizedBox(height: 16),
                                _buildSearchBar(),
                                const SizedBox(height: 12),
                                _buildRoleFilterChips(),
                                const SizedBox(height: 16),
                                _buildResultCount(),
                                const SizedBox(height: 8),
                                if (_filteredUsers.isEmpty)
                                  _buildEmptyState()
                                else
                                  ..._filteredUsers.map(_buildUserCard),
                              ]),
                            ),
                          ),
                        ],
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 64, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            CupertinoButton.filled(
              onPressed: _fetchUsers,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white, size: 18),
                  SizedBox(width: 6),
                  Text("Retry"),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsRow() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildStatCard("Total", _totalCount, CupertinoIcons.person_2_fill,
              AppTheme.primaryIndigo, AppTheme.primaryGradient),
          const SizedBox(width: 10),
          _buildStatCard("Staff", _staffCount, CupertinoIcons.person_fill,
              AppTheme.successGreen, AppTheme.successGradient),
          const SizedBox(width: 10),
          _buildStatCard(
              "Admin",
              _adminCount,
              CupertinoIcons.person_crop_circle_badge_checkmark,
              AppTheme.primaryIndigo,
              AppTheme.primaryGradient),
          const SizedBox(width: 10),
          _buildStatCard(
              "Super Admin",
              _superAdminCount,
              CupertinoIcons.shield_fill,
              CupertinoColors.systemPurple,
              const LinearGradient(
                  colors: [Color(0xFF7C3AED), Color(0xFF9333EA)])),
          const SizedBox(width: 10),
          _buildStatCard(
              "Active",
              _activeCount,
              CupertinoIcons.checkmark_seal_fill,
              AppTheme.successGreen,
              AppTheme.successGradient),
          const SizedBox(width: 10),
          _buildStatCard("Inactive", _inactiveCount,
              CupertinoIcons.nosign, AppTheme.destructiveRed,
              AppTheme.destructiveGradient),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, int count, IconData icon, Color color,
      LinearGradient gradient) {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        boxShadow: AppTheme.shadowColored(color),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xE6FFFFFF), size: 22),
          const SizedBox(height: 8),
          Text(
            count.toString(),
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: CupertinoColors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: Color(0xD9FFFFFF),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return CupertinoSearchTextField(
      controller: _searchController,
      placeholder: "Search by name or email...",
      onChanged: (val) {
        _searchQuery = val;
        _applyFilters();
      },
      onSuffixTap: () {
        _searchController.clear();
        _searchQuery = '';
        _applyFilters();
      },
    );
  }

  Widget _buildRoleFilterChips() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _roles.map((role) {
          final isSelected = _roleFilter == role;
          final label = role == 'ALL' ? 'All Roles' : role.replaceAll('_', ' ');
          final count = role == 'ALL'
              ? _totalCount
              : _users.where((u) => u['role'] == role).length;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                setState(() => _roleFilter = role);
                _applyFilters();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppTheme.primaryIndigo
                      : AppTheme.backgroundAlt,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isSelected
                        ? AppTheme.primaryIndigo
                        : AppTheme.border,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isSelected) ...[
                      const Icon(CupertinoIcons.checkmark,
                          size: 14, color: CupertinoColors.white),
                      const SizedBox(width: 4),
                    ],
                    Text(
                      "$label ($count)",
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.normal,
                        color: isSelected
                            ? CupertinoColors.white
                            : AppTheme.foreground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildResultCount() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        "Showing ${_filteredUsers.length} of $_totalCount users",
        style: AppTheme.bodySm,
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          const Icon(CupertinoIcons.search,
              size: 56, color: CupertinoColors.systemGrey3),
          const SizedBox(height: 16),
          Text(
            "No users found",
            style: AppTheme.headingSm.copyWith(color: AppTheme.muted),
          ),
          const SizedBox(height: 4),
          Text(
            "Try adjusting your search or filters",
            style: AppTheme.bodySm,
          ),
        ],
      ),
    );
  }

  Widget _buildUserCard(Map<String, dynamic> user) {
    final role = (user["role"] ?? "STAFF").toString();
    final isActive = user["isActive"] != false;
    final name = (user["name"] ?? "-").toString();
    final email = (user["email"] ?? "-").toString();
    final phone = (user["phone"] ?? user["mobile"] ?? "").toString();
    final userId = user["id"].toString();
    final createdAt = user["createdAt"];

    String joinDate = "";
    if (createdAt != null) {
      try {
        final dt = DateTime.parse(createdAt.toString());
        joinDate = DateFormat('dd MMM yyyy').format(dt);
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(
          color: isActive ? AppTheme.border : const Color(0xFFEF9A9A),
          width: isActive ? 1 : 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isActive
                      ? _roleColor(role).withOpacity(0.1)
                      : CupertinoColors.systemGrey6,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _roleIcon(role),
                  color: isActive
                      ? _roleColor(role)
                      : CupertinoColors.systemGrey,
                  size: 24,
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
                          child: Text(
                            name,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: isActive
                                  ? AppTheme.foreground
                                  : CupertinoColors.systemGrey,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (!isActive) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.destructiveRed50,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              "INACTIVE",
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFC62828),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(CupertinoIcons.mail,
                            size: 14, color: CupertinoColors.systemGrey),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            email,
                            style: AppTheme.bodySm,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (phone.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(CupertinoIcons.phone,
                              size: 14, color: CupertinoColors.systemGrey),
                          const SizedBox(width: 4),
                          Text(phone, style: AppTheme.bodySm),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              CupertinoButton(
                padding: EdgeInsets.zero,
                minSize: 32,
                onPressed: () => _showActions(userId, role, name, isActive),
                child: const Icon(
                  CupertinoIcons.ellipsis_vertical,
                  color: CupertinoColors.systemGrey,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _roleColor(role).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_roleIcon(role), size: 13, color: _roleColor(role)),
                    const SizedBox(width: 4),
                    Text(
                      role.replaceAll('_', ' '),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: _roleColor(role),
                      ),
                    ),
                  ],
                ),
              ),
              if (isActive) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.successGreen50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: AppTheme.successGreen,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        "Active",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.successGreen,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const Spacer(),
              if (joinDate.isNotEmpty)
                Text("Joined $joinDate", style: AppTheme.labelSm),
            ],
          ),
        ],
      ),
    );
  }

  void _showActions(String userId, String role, String name, bool isActive) {
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _changeRole(userId, role);
            },
            child: const Text("Change Role"),
          ),
          CupertinoActionSheetAction(
            isDestructiveAction: isActive,
            onPressed: () {
              Navigator.pop(ctx);
              _toggleActivation(userId, name, isActive);
            },
            child: Text(isActive ? "Deactivate" : "Activate"),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(ctx),
          child: const Text("Cancel"),
        ),
      ),
    );
  }
}
