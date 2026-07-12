import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

class UserListPage extends StatefulWidget {
  const UserListPage({super.key});

  @override
  State<UserListPage> createState() => _UserListPageState();
}

class _UserListPageState extends State<UserListPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _filteredUsers = [];

  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _roleFilter = 'ALL';
  DateTime? _dateFrom;
  DateTime? _dateTo;

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
    } catch (e) {
      _error = "Network error. Please try again.";
    }
    if (mounted) setState(() => _loading = false);
  }

  /// Users narrowed by the client-side date range (on `createdAt`), layered
  /// on top of the role + search filtered list.
  List<Map<String, dynamic>> get _visibleUsers {
    if (_dateFrom == null && _dateTo == null) return _filteredUsers;
    return _filteredUsers.where((u) {
      final dt = DateTime.tryParse(u['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'users',
      headers: ['Name', 'Email', 'Phone', 'Role', 'Status', 'Created'],
      rows: _visibleUsers.map((u) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(u['createdAt'].toString()));
        } catch (_) {}
        return [
          u['name'] ?? '',
          u['email'] ?? '',
          u['phone'] ?? '',
          (u['role'] ?? '').toString().replaceAll('_', ' '),
          (u['isActive'] != false) ? 'Active' : 'Inactive',
          created,
        ];
      }).toList(),
    );
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
  int get _staffCount =>
      _users.where((u) => u['role'] == 'STAFF').length;
  int get _adminCount =>
      _users.where((u) => u['role'] == 'ADMIN').length;
  int get _superAdminCount =>
      _users.where((u) => u['role'] == 'SUPER_ADMIN').length;
  int get _activeCount =>
      _users.where((u) => u['isActive'] != false).length;
  int get _inactiveCount => _totalCount - _activeCount;

  Future<void> _changeRole(String userId, String currentRole) async {
    String? selectedRole = currentRole;

    final newRole = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text("Change User Role"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: ['STAFF', 'ADMIN', 'SUPER_ADMIN'].map((role) {
              final isSelected = role == selectedRole;
              return RadioListTile<String>(
                value: role,
                groupValue: selectedRole,
                activeColor: AppTheme.primaryIndigo,
                title: Text(
                  role.replaceAll('_', ' '),
                  style: TextStyle(
                    fontWeight:
                        isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                subtitle: Text(
                  _roleDescription(role),
                  style: AppTheme.bodySm,
                ),
                onChanged: (val) {
                  setDialogState(() => selectedRole = val);
                },
              );
            }).toList(),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, selectedRole),
              style: AppTheme.primaryButton(),
              child: const Text("Update Role"),
            ),
          ],
        ),
      ),
    );

    if (newRole == null || newRole == currentRole) return;

    _showLoadingDialog("Updating role...");
    try {
      final res = await HttpService.patch(
        "/api/auth/users/$userId/role",
        {"role": newRole},
      );
      if (mounted) Navigator.pop(context);

      if (res.statusCode == 200) {
        _showSnackBar("Role updated to ${newRole.replaceAll('_', ' ')}",
            isSuccess: true);
        _fetchUsers();
      } else {
        final msg = _parseError(res.body);
        _showSnackBar(msg, isSuccess: false);
      }
    } catch (e) {
      if (mounted) Navigator.pop(context);
      _showSnackBar("Network error. Please try again.", isSuccess: false);
    }
  }

  Future<void> _toggleActivation(
      String userId, String name, bool isCurrentlyActive) async {
    final action = isCurrentlyActive ? "deactivate" : "activate";
    final actionTitle = isCurrentlyActive ? "Deactivate" : "Activate";

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("$actionTitle User"),
        content: Text(
            "Are you sure you want to $action \"$name\"?\n\n${isCurrentlyActive ? "The user will no longer be able to log in." : "The user will regain access to the system."}"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: isCurrentlyActive
                ? AppTheme.destructiveButton()
                : AppTheme.successButton(),
            child: Text(actionTitle),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    _showLoadingDialog("${isCurrentlyActive ? "Deactivating" : "Activating"} user...");
    try {
      final res = await HttpService.patch(
        "/api/auth/users/$userId/deactivate",
        {},
      );
      if (mounted) Navigator.pop(context);

      if (res.statusCode == 200) {
        _showSnackBar(
          "User ${isCurrentlyActive ? "deactivated" : "activated"} successfully",
          isSuccess: true,
        );
        _fetchUsers();
      } else {
        final msg = _parseError(res.body);
        _showSnackBar(msg, isSuccess: false);
      }
    } catch (e) {
      if (mounted) Navigator.pop(context);
      _showSnackBar("Network error. Please try again.", isSuccess: false);
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

  void _showSnackBar(String message, {required bool isSuccess}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isSuccess ? Icons.check_circle : Icons.error,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor:
            isSuccess ? AppTheme.successGreen : AppTheme.destructiveRed,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  void _showLoadingDialog(String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        content: Row(
          children: [
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            const SizedBox(width: 16),
            Text(message),
          ],
        ),
      ),
    );
  }

  Color _roleColor(String role) {
    switch (role) {
      case 'SUPER_ADMIN':
        return Colors.purple;
      case 'ADMIN':
        return AppTheme.primaryIndigo;
      case 'STAFF':
        return AppTheme.successGreen;
      default:
        return Colors.grey;
    }
  }

  IconData _roleIcon(String role) {
    switch (role) {
      case 'SUPER_ADMIN':
        return Icons.shield;
      case 'ADMIN':
        return Icons.admin_panel_settings;
      case 'STAFF':
        return Icons.person;
      default:
        return Icons.person_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("All Users"),
        backgroundColor: AppTheme.primaryIndigo,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleUsers.isEmpty ? null : _exportCsv,
            tooltip: "Export CSV",
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetchUsers,
            tooltip: "Refresh",
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorView()
              : RefreshIndicator(
                  onRefresh: _fetchUsers,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildStatsRow(),
                      const SizedBox(height: 16),
                      _buildSearchBar(),
                      const SizedBox(height: 12),
                      _buildRoleFilterChips(),
                      const SizedBox(height: 12),
                      Container(
                        decoration: AppTheme.cardDecoration(),
                        child: DateRangeFilter(
                          from: _dateFrom,
                          to: _dateTo,
                          tint: AppTheme.primaryIndigo,
                          onFromChanged: (d) => setState(() => _dateFrom = d),
                          onToChanged: (d) => setState(() => _dateTo = d),
                          onClear: () => setState(() {
                            _dateFrom = null;
                            _dateTo = null;
                          }),
                        ),
                      ),
                      const SizedBox(height: 16),
                      _buildResultCount(),
                      const SizedBox(height: 8),
                      if (_visibleUsers.isEmpty)
                        _buildEmptyState()
                      else
                        ..._visibleUsers.map(_buildUserCard),
                    ],
                  ),
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
            Icon(Icons.error_outline, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _fetchUsers,
              icon: const Icon(Icons.refresh),
              label: const Text("Retry"),
              style: AppTheme.primaryButton(),
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
          _buildStatCard("Total", _totalCount, Icons.people,
              AppTheme.primaryIndigo, AppTheme.primaryGradient),
          const SizedBox(width: 10),
          _buildStatCard("Staff", _staffCount, Icons.person,
              AppTheme.successGreen, AppTheme.successGradient),
          const SizedBox(width: 10),
          _buildStatCard("Admin", _adminCount, Icons.admin_panel_settings,
              AppTheme.primaryIndigo, AppTheme.primaryGradient),
          const SizedBox(width: 10),
          _buildStatCard("Super Admin", _superAdminCount, Icons.shield,
              Colors.purple, const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF9333EA)])),
          const SizedBox(width: 10),
          _buildStatCard("Active", _activeCount, Icons.check_circle,
              AppTheme.successGreen, AppTheme.successGradient),
          const SizedBox(width: 10),
          _buildStatCard("Inactive", _inactiveCount, Icons.block,
              AppTheme.destructiveRed, AppTheme.destructiveGradient),
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
          Icon(icon, color: Colors.white.withOpacity(0.9), size: 22),
          const SizedBox(height: 8),
          Text(
            count.toString(),
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.white.withOpacity(0.85),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      decoration: AppTheme.cardDecoration(),
      child: TextField(
        controller: _searchController,
        onChanged: (val) {
          _searchQuery = val;
          _applyFilters();
        },
        decoration: InputDecoration(
          hintText: "Search by name or email...",
          hintStyle: AppTheme.bodySm.copyWith(color: AppTheme.mutedForeground),
          prefixIcon:
              const Icon(Icons.search, color: AppTheme.muted, size: 20),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    _searchController.clear();
                    _searchQuery = '';
                    _applyFilters();
                  },
                )
              : null,
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
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
            child: FilterChip(
              selected: isSelected,
              label: Text("$label ($count)"),
              labelStyle: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected ? Colors.white : AppTheme.foreground,
              ),
              backgroundColor: AppTheme.backgroundAlt,
              selectedColor: AppTheme.primaryIndigo,
              checkmarkColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: BorderSide(
                  color: isSelected
                      ? AppTheme.primaryIndigo
                      : AppTheme.border,
                ),
              ),
              onSelected: (_) {
                setState(() => _roleFilter = role);
                _applyFilters();
              },
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
        "Showing ${_visibleUsers.length} of $_totalCount users",
        style: AppTheme.bodySm,
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Icon(Icons.search_off, size: 56, color: Colors.grey.shade300),
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
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(
          color: isActive ? AppTheme.border : Colors.red.shade200,
          width: isActive ? 1 : 1.5,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: isActive
                        ? _roleColor(role).withOpacity(0.1)
                        : Colors.grey.shade100,
                    child: Icon(
                      _roleIcon(role),
                      color: isActive ? _roleColor(role) : Colors.grey,
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
                                      : Colors.grey,
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
                                child: Text(
                                  "INACTIVE",
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.red.shade700,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Icon(Icons.email_outlined,
                                size: 14, color: Colors.grey.shade500),
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
                              Icon(Icons.phone_outlined,
                                  size: 14, color: Colors.grey.shade500),
                              const SizedBox(width: 4),
                              Text(phone, style: AppTheme.bodySm),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  PopupMenuButton<String>(
                    icon: Icon(Icons.more_vert, color: Colors.grey.shade600),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    onSelected: (action) {
                      switch (action) {
                        case 'role':
                          _changeRole(userId, role);
                          break;
                        case 'toggle_active':
                          _toggleActivation(userId, name, isActive);
                          break;
                      }
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: 'role',
                        child: ListTile(
                          dense: true,
                          leading: Icon(Icons.swap_horiz, size: 20),
                          title: Text("Change Role",
                              style: TextStyle(fontSize: 14)),
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                      PopupMenuItem(
                        value: 'toggle_active',
                        child: ListTile(
                          dense: true,
                          leading: Icon(
                            isActive ? Icons.block : Icons.check_circle,
                            size: 20,
                            color: isActive
                                ? AppTheme.destructiveRed
                                : AppTheme.successGreen,
                          ),
                          title: Text(
                            isActive ? "Deactivate" : "Activate",
                            style: TextStyle(
                              fontSize: 14,
                              color: isActive
                                  ? AppTheme.destructiveRed
                                  : AppTheme.successGreen,
                            ),
                          ),
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ],
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
                        Icon(_roleIcon(role),
                            size: 13, color: _roleColor(role)),
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
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
                    Text(
                      "Joined $joinDate",
                      style: AppTheme.labelSm,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
