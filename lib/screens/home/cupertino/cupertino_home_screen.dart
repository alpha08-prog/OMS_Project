import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show CircleAvatar;
import 'package:intl/intl.dart';
import 'dart:convert';

import '../../../theme/app_theme.dart';
import '../../../services/auth_service.dart';
import '../../../services/http_service.dart';
import '../../../services/theme_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/app_navigator.dart';
import '../../../widgets/cupertino/cupertino_nav_menu.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../main.dart' show themeService;

import '../../../data/top_stories.dart';
import '../../../data/news_data.dart';
import '../../../widgets/story_card.dart';
import '../../../widgets/news_card.dart';
import '../../../widgets/grievance_chart.dart';

class CupertinoHomeScreen extends StatefulWidget {
  final String userName;
  final String role;

  const CupertinoHomeScreen({
    super.key,
    required this.userName,
    required this.role,
  });

  @override
  State<CupertinoHomeScreen> createState() => _CupertinoHomeScreenState();
}

class _CupertinoHomeScreenState extends State<CupertinoHomeScreen> {
  bool _loadingStats = true;

  int totalGrievances = 0;
  int visitorsToday = 0;
  int alerts = 0;

  // Admin pending counts
  int pendingVerifications = 0;
  int pendingTrainRequests = 0;
  int pendingTourDecisions = 0;
  int todayBirthdays = 0;

  // Admin dashboard data
  bool _loadingAdminDashboard = false;
  List<Map<String, dynamic>> _pendingApprovals = [];
  List<Map<String, dynamic>> _todayBirthdaysList = [];

  @override
  void initState() {
    super.initState();
    _fetchDashboardStats();
    if (widget.role == Roles.admin) {
      _fetchAdminDashboard();
    }
  }

  Future<void> _fetchAdminDashboard() async {
    setState(() => _loadingAdminDashboard = true);
    try {
      final futures = await Future.wait([
        HttpService.get("/api/grievances/queue/verification"),
        HttpService.get("/api/train-requests/queue/pending"),
        HttpService.get("/api/tour-programs/pending"),
        HttpService.get("/api/birthdays/today"),
      ]);

      List<Map<String, dynamic>> grievances = [];
      List<Map<String, dynamic>> trains = [];
      List<Map<String, dynamic>> tours = [];
      List<Map<String, dynamic>> birthdays = [];

      if (futures[0].statusCode == 200) {
        final d = jsonDecode(futures[0].body);
        final list = d is List ? d : (d["data"] ?? []);
        grievances = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[1].statusCode == 200) {
        final d = jsonDecode(futures[1].body);
        final list = d is List ? d : (d["data"] ?? []);
        trains = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[2].statusCode == 200) {
        final d = jsonDecode(futures[2].body);
        final list = d is List ? d : (d["data"] ?? []);
        tours = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[3].statusCode == 200) {
        final d = jsonDecode(futures[3].body);
        final list = d is List ? d : (d["data"] ?? []);
        birthdays = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      final combined = <Map<String, dynamic>>[];
      for (final g in grievances) {
        combined.add({
          "_kind": "grievance",
          "title": "Grievance — ${(g["grievanceType"] ?? "").toString()}",
          "subtitle":
              "${g["petitionerName"] ?? "-"} · ${_shortDate(g["createdAt"]?.toString())}",
          "createdAt": g["createdAt"],
          "raw": g,
        });
      }
      for (final t in trains) {
        combined.add({
          "_kind": "train",
          "title": "Train EQ — ${t["passengerName"] ?? "-"}",
          "subtitle":
              "PNR: ${t["pnrNumber"] ?? "-"} · ${_shortDate(t["createdAt"]?.toString())}",
          "createdAt": t["createdAt"],
          "raw": t,
        });
      }
      for (final tp in tours) {
        combined.add({
          "_kind": "tour",
          "title": "Tour — ${tp["eventName"] ?? "-"}",
          "subtitle":
              "${tp["organizer"] ?? "-"} · ${_shortDate(tp["dateTime"]?.toString())}",
          "createdAt": tp["createdAt"],
          "raw": tp,
        });
      }

      combined.sort((a, b) {
        final ad = DateTime.tryParse(a["createdAt"]?.toString() ?? "") ??
            DateTime(2000);
        final bd = DateTime.tryParse(b["createdAt"]?.toString() ?? "") ??
            DateTime(2000);
        return bd.compareTo(ad);
      });

      if (mounted) {
        setState(() {
          _pendingApprovals = combined;
          _todayBirthdaysList = birthdays;
          pendingVerifications = grievances.length;
          pendingTrainRequests = trains.length;
          pendingTourDecisions = tours.length;
          todayBirthdays = birthdays.length;
          _loadingAdminDashboard = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingAdminDashboard = false);
    }
  }

  String _shortDate(String? iso) {
    if (iso == null || iso.isEmpty) return "-";
    try {
      final d = DateTime.parse(iso);
      return DateFormat('M/d/yyyy').format(d);
    } catch (_) {
      return "-";
    }
  }

  Future<void> _fetchDashboardStats() async {
    setState(() => _loadingStats = true);

    try {
      final res = await HttpService.get("/api/stats/summary");

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);

        setState(() {
          totalGrievances = (data["grievances"]?["total"] ?? 0) as int;
          visitorsToday =
              (data["visitorsToday"] ?? data["visitors"]?["today"] ?? 0)
                  as int;
          alerts =
              (data["alerts"] ?? data["news"]?["critical"] ?? 0) as int;
          pendingTrainRequests =
              (data["trainRequests"]?["pending"] ?? 0) as int;
          pendingTourDecisions =
              (data["tourPrograms"]?["pending"] ?? 0) as int;
          todayBirthdays = (data["birthdaysToday"] ?? 0) as int;
          final openGrievances =
              (data["grievances"]?["open"] ?? 0) as int;
          pendingVerifications = openGrievances;
          _loadingStats = false;
        });
      } else if (res.statusCode == 401) {
        await _logout(force: true);
      } else if (res.statusCode == 403) {
        setState(() {
          totalGrievances = 0;
          visitorsToday = 0;
          alerts = 0;
          _loadingStats = false;
        });
      } else {
        setState(() => _loadingStats = false);
      }
    } catch (_) {
      setState(() => _loadingStats = false);
    }
  }

  Future<void> _logout({bool force = false}) async {
    await AuthService.logout();
    if (!mounted) return;

    if (!force) {
      CupertinoToast.show(context, "Logged out successfully");
    }

    AppNavigator.toLogin(context);
  }

  void _openNavMenu() {
    Navigator.push(
      context,
      CupertinoPageRoute(
        builder: (_) => CupertinoNavMenu(
          userName: widget.userName,
          role: widget.role,
          onLogout: () => _logout(),
          onToggleTheme: () => themeService.toggleTheme(),
          isDark: themeService.isDark,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoTabScaffold(
      tabBar: CupertinoTabBar(
        activeColor: AppTheme.primaryIndigo,
        inactiveColor: CupertinoColors.systemGrey,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.house_fill),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.doc_text),
            label: 'Grievances',
          ),
          BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.person_2),
            label: 'Visitors',
          ),
          BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.gift),
            label: 'Birthdays',
          ),
          BottomNavigationBarItem(
            icon: Icon(CupertinoIcons.ellipsis),
            label: 'More',
          ),
        ],
      ),
      tabBuilder: (context, index) {
        switch (index) {
          case 0:
            return CupertinoTabView(builder: (_) => _buildDashboardTab());
          case 1:
            return CupertinoTabView(
              builder: (_) => _buildPlaceholderTab(
                'Grievances',
                CupertinoIcons.doc_text,
                () => AppNavigator.toGrievanceEntry(context, role: widget.role),
              ),
            );
          case 2:
            return CupertinoTabView(
              builder: (_) => _buildPlaceholderTab(
                'Visitors',
                CupertinoIcons.person_2,
                () => AppNavigator.toVisitorEntry(context, role: widget.role),
              ),
            );
          case 3:
            return CupertinoTabView(
              builder: (_) => _buildPlaceholderTab(
                'Birthdays',
                CupertinoIcons.gift,
                () => AppNavigator.toBirthday(context, role: widget.role),
              ),
            );
          case 4:
            return CupertinoTabView(
              builder: (_) => CupertinoNavMenu(
                userName: widget.userName,
                role: widget.role,
                onLogout: () => _logout(),
                onToggleTheme: () => themeService.toggleTheme(),
                isDark: themeService.isDark,
              ),
            );
          default:
            return CupertinoTabView(builder: (_) => _buildDashboardTab());
        }
      },
    );
  }

  // ================= PLACEHOLDER TAB =================
  Widget _buildPlaceholderTab(
      String title, IconData icon, VoidCallback onNavigate) {
    // Trigger navigation on next frame so it runs after build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      onNavigate();
    });

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(title),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: AppTheme.primaryIndigo),
            const SizedBox(height: 16),
            Text(
              'Loading $title...',
              style: const TextStyle(
                fontSize: 16,
                color: CupertinoColors.systemGrey,
              ),
            ),
            const SizedBox(height: 16),
            const CupertinoActivityIndicator(),
          ],
        ),
      ),
    );
  }

  // ================= DASHBOARD TAB =================
  Widget _buildDashboardTab() {
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: _openNavMenu,
          child: const Icon(CupertinoIcons.bars, size: 26),
        ),
        middle: const Text('OMS Dashboard'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () {},
              child: const Icon(CupertinoIcons.search, size: 22),
            ),
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () {},
              child: const Icon(CupertinoIcons.bell, size: 22),
            ),
          ],
        ),
      ),
      child: SafeArea(
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            CupertinoSliverRefreshControl(
              onRefresh: () async {
                await _fetchDashboardStats();
                if (widget.role == Roles.admin) {
                  await _fetchAdminDashboard();
                }
              },
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome header
                    _buildWelcomeHeader(),
                    const SizedBox(height: 16),

                    // Stats cards
                    _loadingStats ? _statsLoadingRow() : _statsRow(),
                    const SizedBox(height: 20),

                    // Admin: New dashboard layout
                    if (widget.role == Roles.admin) ...[
                      _buildAdminWelcomeBanner(),
                      const SizedBox(height: 16),
                      _buildAdminActionCards(),
                      const SizedBox(height: 20),
                      _buildAdminPendingApprovals(),
                      const SizedBox(height: 16),
                      _buildAdminBirthdaysCard(),
                      const SizedBox(height: 20),
                    ],

                    // Super Admin: keep existing
                    if (widget.role == Roles.superAdmin) ...[
                      _sectionTitle("Pending Actions"),
                      const SizedBox(height: 12),
                      _buildPendingActionsGrid(),
                      const SizedBox(height: 20),
                      const GrievanceChart(),
                      const SizedBox(height: 20),
                    ],

                    // Staff: Quick Actions
                    if (widget.role == Roles.staff) ...[
                      _sectionTitle("Quick Actions"),
                      const SizedBox(height: 12),
                      _buildQuickActions(),
                      const SizedBox(height: 20),
                    ],

                    // Popular Stories (hidden for admin)
                    if (widget.role != Roles.admin) ...[
                      _sectionTitle("Popular Stories"),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 185,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          itemCount: topStories.length,
                          itemBuilder: (context, index) =>
                              StoryCard(story: topStories[index]),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Container(
                        height: 1,
                        color: CupertinoColors.separator,
                      ),
                      const SizedBox(height: 18),
                    ],
                    // News Updates (hidden for admin)
                    if (widget.role != Roles.admin) ...[
                      _sectionTitle("News Updates"),
                      const SizedBox(height: 12),
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: newsList.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 12),
                        itemBuilder: (context, index) =>
                            NewsCard(news: newsList[index]),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= WELCOME HEADER =================
  Widget _buildWelcomeHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowMd,
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 24,
            backgroundColor: CupertinoColors.white,
            child: Icon(CupertinoIcons.person_fill,
                size: 26, color: AppTheme.primaryIndigo),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Welcome,",
                  style: TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.systemGrey5,
                  ),
                ),
                Text(
                  widget.userName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                    color: CupertinoColors.white,
                  ),
                ),
                Text(
                  "Role: ${widget.role}",
                  style: const TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ================= STATS LOADING =================
  Widget _statsLoadingRow() {
    return Row(
      children: [
        _loadingCard(),
        _loadingCard(),
        _loadingCard(noRightMargin: true),
      ],
    );
  }

  Widget _loadingCard({bool noRightMargin = false}) {
    return Expanded(
      child: Container(
        margin: EdgeInsets.only(right: noRightMargin ? 0 : 10),
        height: 92,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemBackground,
          borderRadius: BorderRadius.circular(16),
          boxShadow: AppTheme.shadowSm,
        ),
        child: const Center(child: CupertinoActivityIndicator()),
      ),
    );
  }

  // ================= STATS ROW =================
  Widget _statsRow() {
    return Row(
      children: [
        _statCard(
          icon: CupertinoIcons.doc_text_fill,
          value: "$totalGrievances",
          label: "Grievances",
          iconBg: const Color(0xFFEFF6FF),
          iconColor: AppTheme.primaryIndigo,
        ),
        _statCard(
          icon: CupertinoIcons.person_2_fill,
          value: "$visitorsToday",
          label: "Visitors",
          iconBg: const Color(0xFFECFDF5),
          iconColor: AppTheme.successGreen,
        ),
        _statCard(
          icon: CupertinoIcons.exclamationmark_triangle_fill,
          value: "$alerts",
          label: "Alerts",
          iconBg: const Color(0xFFFFF7ED),
          iconColor: AppTheme.saffron,
          noRightMargin: true,
        ),
      ],
    );
  }

  Widget _statCard({
    required IconData icon,
    required String value,
    required String label,
    required Color iconBg,
    required Color iconColor,
    bool noRightMargin = false,
  }) {
    return Expanded(
      child: Container(
        margin: EdgeInsets.only(right: noRightMargin ? 0 : 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemBackground,
          borderRadius: BorderRadius.circular(16),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Icon(icon, color: iconColor, size: 20),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppTheme.foreground,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= PENDING ACTIONS (Admin) =================
  Widget _buildPendingActionsGrid() {
    final items = [
      _PendingAction(
        icon: CupertinoIcons.checkmark_seal,
        label: "Verify Grievances",
        count: pendingVerifications,
        color: AppTheme.saffron,
        onTap: () => AppNavigator.toVerificationQueue(context),
      ),
      _PendingAction(
        icon: CupertinoIcons.train_style_one,
        label: "Train Approvals",
        count: pendingTrainRequests,
        color: AppTheme.primaryIndigo,
        onTap: () => AppNavigator.toTrainQueue(context),
      ),
      _PendingAction(
        icon: CupertinoIcons.calendar,
        label: "Tour Decisions",
        count: pendingTourDecisions,
        color: const Color(0xFF9333EA),
        onTap: () => AppNavigator.toTourQueue(context),
      ),
      _PendingAction(
        icon: CupertinoIcons.printer,
        label: "Print Center",
        count: 0,
        color: AppTheme.successGreen,
        onTap: () => AppNavigator.toPrintCenter(context),
      ),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 2.2,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return _pendingActionCard(
          icon: item.icon,
          label: item.label,
          count: item.count,
          color: item.color,
          onTap: item.onTap,
        );
      },
    );
  }

  Widget _pendingActionCard({
    required IconData icon,
    required String label,
    required int count,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: CupertinoColors.systemBackground,
          borderRadius: BorderRadius.circular(12),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Icon(icon, color: color, size: 18),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.foreground,
                    ),
                  ),
                  if (count > 0)
                    Text(
                      "$count pending",
                      style: TextStyle(
                        fontSize: 11,
                        color: color,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= QUICK ACTIONS (Staff) =================
  Widget _buildQuickActions() {
    return SizedBox(
      height: 90,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _quickActionCard(
            CupertinoIcons.doc_text,
            "New\nGrievance",
            AppTheme.primaryIndigo,
            () => AppNavigator.toGrievanceEntry(context, role: widget.role),
          ),
          _quickActionCard(
            CupertinoIcons.train_style_one,
            "Train\nRequest",
            AppTheme.primaryIndigoLight,
            () =>
                AppNavigator.toTrainRequestEntry(context, role: widget.role),
          ),
          _quickActionCard(
            CupertinoIcons.person_2,
            "Visitor\nEntry",
            AppTheme.successGreen,
            () => AppNavigator.toVisitorEntry(context, role: widget.role),
          ),
          _quickActionCard(
            CupertinoIcons.calendar,
            "Tour\nProgram",
            const Color(0xFF9333EA),
            () =>
                AppNavigator.toTourProgramEntry(context, role: widget.role),
          ),
          _quickActionCard(
            CupertinoIcons.news,
            "News\nEntry",
            AppTheme.saffron,
            () => AppNavigator.toNewsEntry(context, role: widget.role),
          ),
          _quickActionCard(
            CupertinoIcons.doc_checkmark,
            "Event\nReports",
            AppTheme.saffronDark,
            () => AppNavigator.toEventReports(context),
          ),
        ],
      ),
    );
  }

  Widget _quickActionCard(
      IconData icon, String label, Color color, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 80,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: CupertinoColors.systemBackground,
            borderRadius: BorderRadius.circular(12),
            boxShadow: AppTheme.shadowSm,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ================= SECTION TITLE =================
  Widget _sectionTitle(String title) {
    return Text(
      title.toUpperCase(),
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.bold,
        letterSpacing: 0.8,
        color: AppTheme.foreground,
      ),
    );
  }

  // ================= ADMIN DASHBOARD WIDGETS =================

  Widget _buildAdminWelcomeBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Welcome, ${widget.userName}",
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E1B4B),
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                const Text(
                  "Verification & Letter Management",
                  style: TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.systemGrey,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFE0E7FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Text(
              "ADMIN ACCESS",
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: Color(0xFF4338CA),
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdminActionCards() {
    final cards = <Map<String, dynamic>>[
      {
        'icon': CupertinoIcons.checkmark_seal,
        'title': 'Verify Grievances',
        'subtitle': pendingVerifications == 1
            ? '1 pending verification'
            : '$pendingVerifications pending verification',
        'btn': 'Open Queue',
        'tap': () => AppNavigator.toVerificationQueue(context),
      },
      {
        'icon': CupertinoIcons.printer,
        'title': 'Print Letters',
        'subtitle': 'Generate and print official letters',
        'btn': 'Print Center',
        'tap': () => AppNavigator.toPrintCenter(context),
      },
      {
        'icon': CupertinoIcons.tram_fill,
        'title': 'Train EQ Letters',
        'subtitle': pendingTrainRequests == 1
            ? '1 pending approval'
            : '$pendingTrainRequests pending approval',
        'btn': 'View Requests',
        'tap': () => AppNavigator.toTrainQueue(context),
      },
      {
        'icon': CupertinoIcons.calendar_today,
        'title': 'Tour Decisions',
        'subtitle': pendingTourDecisions == 1
            ? '1 pending decisions'
            : '$pendingTourDecisions pending decisions',
        'btn': 'Review',
        'tap': () => AppNavigator.toTourQueue(context),
      },
    ];

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 0.95,
      children: cards.map((c) => _adminActionCardTile(c)).toList(),
    );
  }

  Widget _adminActionCardTile(Map<String, dynamic> c) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(c['icon'] as IconData,
                color: const Color(0xFF4338CA), size: 20),
          ),
          const SizedBox(height: 10),
          Text(
            c['title'] as String,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            c['subtitle'] as String,
            style: const TextStyle(
              fontSize: 11,
              color: CupertinoColors.systemGrey,
              height: 1.3,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 8),
              color: AppTheme.saffron,
              borderRadius: BorderRadius.circular(8),
              onPressed: c['tap'] as VoidCallback,
              child: Text(
                c['btn'] as String,
                style: const TextStyle(
                  color: CupertinoColors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdminPendingApprovals() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                "Pending Approvals",
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1E1B4B),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  "${_pendingApprovals.length} Pending",
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFB91C1C),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingAdminDashboard)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 30),
              child: Center(child: CupertinoActivityIndicator()),
            )
          else if (_pendingApprovals.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Column(
                  children: [
                    const Icon(CupertinoIcons.checkmark_seal_fill,
                        size: 40, color: AppTheme.successGreen),
                    const SizedBox(height: 8),
                    const Text(
                      "All caught up — no pending approvals",
                      style: TextStyle(
                          color: CupertinoColors.systemGrey, fontSize: 12),
                    ),
                  ],
                ),
              ),
            )
          else
            ..._pendingApprovals.take(20).map(_buildPendingApprovalRow),
        ],
      ),
    );
  }

  Widget _buildPendingApprovalRow(Map<String, dynamic> item) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item["title"] ?? "-",
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  item["subtitle"] ?? "",
                  style: const TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          CupertinoButton(
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            color: const Color(0xFFE0E7FF),
            borderRadius: BorderRadius.circular(8),
            onPressed: () => _onApprovalRowTap(item),
            child: const Text(
              "Review",
              style: TextStyle(
                color: Color(0xFF4338CA),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _onApprovalRowTap(Map<String, dynamic> item) {
    final kind = item["_kind"];
    if (kind == "grievance") {
      AppNavigator.toVerificationQueue(context);
    } else if (kind == "train") {
      AppNavigator.toTrainQueue(context);
    } else if (kind == "tour") {
      AppNavigator.toTourQueue(context);
    }
  }

  Widget _buildAdminBirthdaysCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFDF2F8),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFCE7F3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFCE7F3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(CupertinoIcons.gift_fill,
                    color: Color(0xFFEC4899), size: 18),
              ),
              const SizedBox(width: 10),
              const Text(
                "Today's Birthdays",
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1E1B4B),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_todayBirthdaysList.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  "No birthdays today",
                  style: TextStyle(
                    color: CupertinoColors.systemGrey,
                    fontSize: 12,
                  ),
                ),
              ),
            )
          else
            ..._todayBirthdaysList.map((b) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Icon(CupertinoIcons.person,
                          size: 14, color: Color(0xFFEC4899)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "${b["name"] ?? "-"}${b["relation"] != null ? " · ${b["relation"]}" : ""}",
                          style: const TextStyle(
                              fontSize: 13, color: Color(0xFF0F172A)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }
}

// Helper class for pending action items
class _PendingAction {
  final IconData icon;
  final String label;
  final int count;
  final Color color;
  final VoidCallback onTap;

  const _PendingAction({
    required this.icon,
    required this.label,
    required this.count,
    required this.color,
    required this.onTap,
  });
}
