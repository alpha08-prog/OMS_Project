import 'dart:async';
import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show CircleAvatar;
import 'package:intl/intl.dart';

import '../../../theme/app_theme.dart';
import '../../../services/auth_service.dart';
import '../../../services/http_service.dart';
import '../../../services/notification_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/app_navigator.dart';
import '../../../widgets/cupertino/cupertino_nav_menu.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../main.dart' show themeService;

import '../../../data/top_stories.dart';
import '../../../data/news_data.dart';
import '../../../widgets/story_card.dart';
import '../../../widgets/news_card.dart';
import '../../../widgets/grievance_donut_painter.dart';

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

class _CupertinoHomeScreenState extends State<CupertinoHomeScreen>
    with WidgetsBindingObserver {
  // Polled in-app notification badge — same cadence as the Material home.
  int _unreadNotifications = 0;
  Timer? _notificationPollTimer;

  bool _loadingStats = true;

  int totalGrievances = 0;
  int openGrievances = 0;
  int inProgressGrievances = 0;
  int resolvedGrievances = 0;
  int visitorsToday = 0;
  int alerts = 0;
  int totalTourPrograms = 0;
  int totalTrainRequests = 0;

  // Admin pending counts
  int pendingVerifications = 0;
  int pendingTrainRequests = 0;
  int pendingTourDecisions = 0;
  int todayBirthdays = 0;

  // Admin dashboard data
  bool _loadingAdminDashboard = false;
  List<Map<String, dynamic>> _pendingApprovals = [];
  List<Map<String, dynamic>> _todayBirthdaysList = [];

  // Staff: rejected grievances created by this staff member
  List<Map<String, dynamic>> _staffRejectedGrievances = [];
  bool _staffRejectedExpanded = true;

  // Staff: combined recent entries (grievances, trains, tours, visitors, news)
  List<Map<String, dynamic>> _staffRecentEntries = [];

  // Admin: Pending Approvals inline expand toggle
  bool _adminPendingExpanded = false;

  // Super Admin extras
  List<Map<String, dynamic>> _newsItems = [];
  List<dynamic> recentGrievances = [];
  List<dynamic> todaySchedule = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _fetchDashboardStats();
    if (widget.role == Roles.admin) {
      _fetchAdminDashboard();
    }
    if (widget.role == Roles.superAdmin) {
      _fetchSuperAdminExtras();
      _fetchDashboardWidgets();
    }
    if (widget.role == Roles.staff) {
      _fetchStaffRejectedGrievances();
      _fetchStaffRecentEntries();
    }
    _refreshUnreadCount();
    _notificationPollTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _refreshUnreadCount(),
    );
  }

  @override
  void dispose() {
    _notificationPollTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshUnreadCount();
    }
  }

  Future<void> _refreshUnreadCount() async {
    final count = await NotificationService.unreadCount();
    if (!mounted) return;
    if (count != _unreadNotifications) {
      setState(() => _unreadNotifications = count);
    }
  }

  Widget _buildBellWithBadge() {
    final hasUnread = _unreadNotifications > 0;
    return SizedBox(
      width: 36,
      height: 36,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Icon(
            hasUnread ? CupertinoIcons.bell_fill : CupertinoIcons.bell,
            size: 22,
            color: CupertinoColors.white,
          ),
          if (hasUnread)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                decoration: BoxDecoration(
                  color: CupertinoColors.systemRed,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: CupertinoColors.white, width: 1),
                ),
                child: Text(
                  _unreadNotifications > 99 ? '99+' : '$_unreadNotifications',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: CupertinoColors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _fetchStaffRecentEntries() async {
    try {
      final futures = await Future.wait([
        HttpService.get("/api/grievances?limit=10"),
        HttpService.get("/api/train-requests?limit=10"),
        HttpService.get("/api/tour-programs?limit=10"),
        HttpService.get("/api/visitors?limit=10"),
        HttpService.get("/api/news?limit=10"),
      ]);

      List<Map<String, dynamic>> decodeList(dynamic body) {
        try {
          final d = jsonDecode(body);
          final list = d is List ? d : (d["data"] ?? []);
          return (list as List)
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
        } catch (_) {
          return [];
        }
      }

      final combined = <Map<String, dynamic>>[];

      if (futures[0].statusCode == 200) {
        for (final g in decodeList(futures[0].body)) {
          final type =
              (g["grievanceType"] ?? "").toString().replaceAll("_", " ");
          final name = (g["petitionerName"] ?? "").toString();
          combined.add({
            "label": "Grievance – $type${name.isEmpty ? "" : " - $name"}",
            "date": g["createdAt"]?.toString(),
          });
        }
      }
      if (futures[1].statusCode == 200) {
        for (final t in decodeList(futures[1].body)) {
          final pnr = (t["pnrNumber"] ?? "").toString();
          combined.add({
            "label": "Train EQ – PNR ${pnr.isEmpty ? "-" : pnr}",
            "date": t["createdAt"]?.toString(),
          });
        }
      }
      if (futures[2].statusCode == 200) {
        for (final tp in decodeList(futures[2].body)) {
          final ev = (tp["eventName"] ?? "-").toString();
          combined.add({
            "label": "Tour Program – $ev",
            "date": tp["createdAt"]?.toString(),
          });
        }
      }
      if (futures[3].statusCode == 200) {
        for (final v in decodeList(futures[3].body)) {
          final purpose = (v["purpose"] ?? "Public").toString();
          final name = (v["name"] ?? "").toString();
          combined.add({
            "label": "Visitor – $purpose${name.isEmpty ? "" : " - $name"}",
            "date": v["createdAt"]?.toString(),
          });
        }
      }
      if (futures[4].statusCode == 200) {
        for (final n in decodeList(futures[4].body)) {
          final title = (n["title"] ?? "-").toString();
          combined.add({
            "label": "News – $title",
            "date": n["createdAt"]?.toString(),
          });
        }
      }

      combined.sort((a, b) {
        final aDate = DateTime.tryParse(a["date"] ?? "") ?? DateTime(2000);
        final bDate = DateTime.tryParse(b["date"] ?? "") ?? DateTime(2000);
        return bDate.compareTo(aDate);
      });

      if (mounted) {
        setState(() => _staffRecentEntries = combined);
      }
    } catch (_) {}
  }

  Future<void> _fetchStaffRejectedGrievances() async {
    try {
      final res = await HttpService.get(
          "/api/grievances?status=REJECTED&limit=20");
      if (res.statusCode != 200) return;
      final decoded = jsonDecode(res.body);
      final list = decoded is List ? decoded : (decoded["data"] ?? []);
      final items = (list as List)
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
      if (mounted) {
        setState(() => _staffRejectedGrievances = items);
      }
    } catch (_) {}
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
        final isOffice =
            (g["source"] ?? "PUBLIC").toString().toUpperCase() == "OFFICE";
        combined.add({
          "_kind": "grievance",
          "title": "Grievance — ${(g["grievanceType"] ?? "").toString()}",
          "subtitle":
              "${g["petitionerName"] ?? "-"} · ${_shortDate(g["createdAt"]?.toString())}",
          "createdAt": g["createdAt"],
          "isOffice": isOffice,
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
        final body = jsonDecode(res.body);
        final data =
            (body is Map && body["data"] != null) ? body["data"] : body;

        setState(() {
          totalGrievances = (data["grievances"]?["total"] ?? 0) as int;
          openGrievances = (data["grievances"]?["open"] ?? 0) as int;
          inProgressGrievances =
              (data["grievances"]?["inProgress"] ?? 0) as int;
          resolvedGrievances =
              (data["grievances"]?["resolved"] ?? 0) as int;
          visitorsToday = (data["visitorsToday"] ??
              data["visitors"]?["today"] ??
              0) as int;
          alerts =
              (data["alerts"] ?? data["news"]?["critical"] ?? 0) as int;
          pendingTrainRequests =
              (data["trainRequests"]?["pending"] ?? 0) as int;
          pendingTourDecisions =
              (data["tourPrograms"]?["pending"] ?? 0) as int;
          totalTourPrograms =
              (data["tourPrograms"]?["total"] ?? 0) as int;
          totalTrainRequests =
              (data["trainRequests"]?["total"] ?? 0) as int;
          todayBirthdays = (data["birthdays"]?["today"] ??
              data["birthdaysToday"] ??
              0) as int;
          pendingVerifications =
              (data["grievances"]?["pendingVerification"] ??
                  openGrievances) as int;
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

  Future<void> _fetchSuperAdminExtras() async {
    try {
      final futures = await Future.wait([
        HttpService.get("/api/birthdays/today"),
        HttpService.get("/api/news?limit=20"),
      ]);

      if (!mounted) return;

      List<Map<String, dynamic>> birthdays = [];
      List<Map<String, dynamic>> news = [];

      if (futures[0].statusCode == 200) {
        final d = jsonDecode(futures[0].body);
        final list = d is List ? d : (d["data"] ?? []);
        birthdays = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[1].statusCode == 200) {
        final d = jsonDecode(futures[1].body);
        final list = d is List ? d : (d["data"] ?? []);
        news = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      setState(() {
        _todayBirthdaysList = birthdays;
        todayBirthdays = birthdays.length;
        _newsItems = news;
      });
    } catch (_) {}
  }

  Future<void> _fetchDashboardWidgets() async {
    try {
      final futures = await Future.wait([
        HttpService.get("/api/tour-programs/schedule/today"),
        HttpService.get("/api/grievances?limit=5"),
      ]);

      if (!mounted) return;
      setState(() {
        if (futures[0].statusCode == 200) {
          final d = jsonDecode(futures[0].body);
          todaySchedule = d is List ? d : (d["data"] ?? []);
        }
        if (futures[1].statusCode == 200) {
          final d = jsonDecode(futures[1].body);
          recentGrievances = d is List ? d : (d["data"] ?? []);
        }
      });
    } catch (_) {}
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
    // SUPER_ADMIN: dashboard-only, no bottom tab bar.
    if (widget.role == Roles.superAdmin) {
      return _buildDashboardTab();
    }

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
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: title, showBack: false),
          Expanded(
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
          ),
        ],
      ),
    );
  }

  // ================= DASHBOARD TAB =================
  Widget _buildDashboardTab() {
    final isSuperAdmin = widget.role == Roles.superAdmin;

    final Widget header = isSuperAdmin
        ? _buildSuperAdminHeader()
        : OmsPageHeader(
            title: 'OMS Dashboard',
            showBack: false,
            leading: CupertinoButton(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              onPressed: _openNavMenu,
              child: const Icon(CupertinoIcons.bars,
                  color: CupertinoColors.white, size: 24),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: () {},
                  child: const Icon(CupertinoIcons.search,
                      color: CupertinoColors.white, size: 22),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: () async {
                    await AppNavigator.toNotifications(context,
                        role: widget.role);
                    _refreshUnreadCount();
                  },
                  child: _buildBellWithBadge(),
                ),
              ],
            ),
          );

    return CupertinoPageScaffold(
      backgroundColor:
          isSuperAdmin ? const Color(0xFFF6F7FB) : null,
      child: Column(
        children: [
          header,
          Expanded(
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
                if (widget.role == Roles.superAdmin) {
                  await _fetchSuperAdminExtras();
                  await _fetchDashboardWidgets();
                }
                if (widget.role == Roles.staff) {
                  await _fetchStaffRejectedGrievances();
                  await _fetchStaffRecentEntries();
                }
              },
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, isSuperAdmin ? 24 : 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // SUPER_ADMIN: dashboard-only redesigned layout
                    if (isSuperAdmin) ...[
                      _buildSuperAdminHero(),
                      const SizedBox(height: 16),
                      _loadingStats
                          ? _statsLoadingRow()
                          : _buildSuperAdminStats(),
                      const SizedBox(height: 20),
                      _buildSaTourProgramCard(),
                      const SizedBox(height: 16),
                      _buildSaGrievanceStatusCard(),
                      const SizedBox(height: 16),
                      _buildSaRecentGrievancesCard(),
                      const SizedBox(height: 16),
                      _buildSaTodaysBirthdaysCard(),
                      const SizedBox(height: 16),
                      _buildSaNewsIntelligenceCard(),
                      const SizedBox(height: 24),
                    ]
                    // ADMIN: dashboard-only (welcome banner + 4 cards + pending approvals + birthdays)
                    else if (widget.role == Roles.admin) ...[
                      _buildAdminWelcomeBanner(),
                      const SizedBox(height: 16),
                      _buildAdminActionCards(),
                      const SizedBox(height: 20),
                      _buildAdminPendingApprovals(),
                      const SizedBox(height: 16),
                      _buildAdminBirthdaysCard(),
                      const SizedBox(height: 20),
                    ]
                    // STAFF: Data Entry Portal layout
                    else if (widget.role == Roles.staff) ...[
                      _buildStaffHero(),
                      const SizedBox(height: 16),
                      _buildStaffQuickEntry(),
                      const SizedBox(height: 16),
                      _buildStaffTodaysWork(),
                      if (_staffRejectedGrievances.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _buildStaffRejectedGrievances(),
                      ],
                      const SizedBox(height: 16),
                      _buildStaffRecentlyEntered(),
                      const SizedBox(height: 20),
                    ]
                    // Default (unknown role): generic welcome + stats + stories + news
                    else ...[
                      _buildWelcomeHeader(),
                      const SizedBox(height: 16),
                      _loadingStats ? _statsLoadingRow() : _statsRow(),
                      const SizedBox(height: 20),
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
        ],
      ),
    );
  }

  // ================= SUPER ADMIN HEADER =================
  Widget _buildSuperAdminHeader() {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? "Good Morning"
        : hour < 17
            ? "Good Afternoon"
            : "Good Evening";
    final dateStr = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return OmsPageHeader(
      title: "$greeting, Super Admin",
      subtitle: Text(
        dateStr,
        style: const TextStyle(
          inherit: false,
          color: CupertinoColors.white,
          fontSize: 11,
          fontWeight: FontWeight.w400,
          decoration: TextDecoration.none,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      showBack: false,
      leading: CupertinoButton(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        onPressed: _openNavMenu,
        child: const Icon(CupertinoIcons.bars,
            color: CupertinoColors.white, size: 24),
      ),
      trailing: CupertinoButton(
        padding: const EdgeInsets.only(right: 4),
        onPressed: () async {
          await AppNavigator.toNotifications(context, role: widget.role);
          _refreshUnreadCount();
        },
        child: _buildBellWithBadge(),
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


  // ================= STAFF DATA ENTRY PORTAL =================
  Widget _buildStaffHero() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Welcome, ${widget.userName}",
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E293B),
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "Data Entry Portal",
                  style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFE0E7FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Text(
              "STAFF ACCESS",
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
                color: Color(0xFF4338CA),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _staffSurfaceCard({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: const Color(0x0A000000),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _staffSectionTitle(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: Color(0xFF0F172A),
      ),
    );
  }

  Widget _buildStaffQuickEntry() {
    final entries = <_StaffEntry>[
      _StaffEntry(
        icon: CupertinoIcons.doc_text,
        label: "New Grievance",
        color: const Color(0xFFF59E0B),
        onTap: () =>
            AppNavigator.toGrievanceEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: CupertinoIcons.train_style_one,
        label: "Train EQ",
        color: const Color(0xFFF59E0B),
        onTap: () =>
            AppNavigator.toTrainRequestEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: CupertinoIcons.person_2,
        label: "Visitor Entry",
        color: const Color(0xFF1E293B),
        onTap: () => AppNavigator.toVisitorEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: CupertinoIcons.calendar,
        label: "Tour Program",
        color: const Color(0xFF0284C7),
        onTap: () =>
            AppNavigator.toTourProgramEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: CupertinoIcons.news,
        label: "News Entry",
        color: const Color(0xFF0D9488),
        onTap: () => AppNavigator.toNewsEntry(context, role: widget.role),
      ),
    ];

    return _staffSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _staffSectionTitle("Quick Entry"),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              const spacing = 10.0;
              final width = constraints.maxWidth;
              final perRow = width >= 720 ? 5 : (width >= 480 ? 3 : 2);
              final cardWidth =
                  (width - spacing * (perRow - 1)) / perRow;

              return Wrap(
                spacing: spacing,
                runSpacing: spacing,
                children: entries
                    .map((e) => SizedBox(
                          width: cardWidth,
                          height: 88,
                          child: _staffEntryTile(e),
                        ))
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _staffEntryTile(_StaffEntry e) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: e.onTap,
      child: Container(
        decoration: BoxDecoration(
          color: e.color,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(10),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(e.icon, color: CupertinoColors.white, size: 22),
            const SizedBox(height: 8),
            Text(
              e.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: CupertinoColors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStaffTodaysWork() {
    return _staffSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _staffSectionTitle("Today's Work"),
          const SizedBox(height: 10),
          _staffBullet("Enter grievances received today"),
          _staffBullet("Log walk-in visitors"),
          _staffBullet("Record tour invitations"),
        ],
      ),
    );
  }

  Widget _staffBullet(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 8, right: 8, left: 2),
            child: Icon(CupertinoIcons.circle_fill,
                size: 5, color: Color(0xFF64748B)),
          ),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF475569),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ================= STAFF: REJECTED GRIEVANCES =================
  Widget _buildStaffRejectedGrievances() {
    const accent = Color(0xFFDC2626);
    const bg = Color(0xFFFEF2F2);
    const border = Color(0xFFFECACA);
    const pillBg = Color(0xFFFEE2E2);
    const muted = Color(0xFF94A3B8);

    final preview = _staffRejectedGrievances.take(3).toList();
    final total = _staffRejectedGrievances.length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            children: [
              GestureDetector(
                onTap: () => setState(
                    () => _staffRejectedExpanded = !_staffRejectedExpanded),
                child: Padding(
                  padding: const EdgeInsets.all(2),
                  child: Icon(
                    _staffRejectedExpanded
                        ? CupertinoIcons.chevron_down
                        : CupertinoIcons.chevron_right,
                    color: const Color(0xFF334155),
                    size: 18,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              const Icon(CupertinoIcons.xmark_circle,
                  color: accent, size: 19),
              const SizedBox(width: 8),
              const Text(
                "Rejected Grievances",
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                "($total)",
                style: const TextStyle(
                  fontSize: 14,
                  color: muted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => AppNavigator.toRejectedGrievances(context,
                    role: widget.role),
                child: const Padding(
                  padding:
                      EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text(
                    "View all",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: accent,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (_staffRejectedExpanded) ...[
            const SizedBox(height: 10),
            ...preview.map((g) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _staffRejectedItem(g, accent, pillBg),
                )),
            const Padding(
              padding: EdgeInsets.only(top: 4, left: 4),
              child: Row(
                children: [
                  Text(
                    "Check the bell ",
                    style:
                        TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                  ),
                  Text("🔔", style: TextStyle(fontSize: 12)),
                  Text(
                    " in the top bar for the rejection reason.",
                    style:
                        TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _staffRejectedItem(
      Map<String, dynamic> g, Color accent, Color pillBg) {
    final petitioner = (g["petitionerName"] ?? "-").toString();
    final type = (g["grievanceType"] ?? "-").toString().replaceAll("_", " ");
    final dateStr = _fmtDayMonthYear(g["createdAt"]?.toString());

    return GestureDetector(
      onTap: () => AppNavigator.toGrievanceView(
        context,
        grievanceData: g,
        role: widget.role,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(10),
        ),
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: petitioner,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        const TextSpan(
                          text: "  —  ",
                          style: TextStyle(
                            fontSize: 13,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                        TextSpan(
                          text: type.toUpperCase(),
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: accent,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    "Submitted $dateStr",
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: pillBg,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                "REJECTED",
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.6,
                  color: accent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _fmtDayMonthYear(String? iso) {
    if (iso == null || iso.isEmpty) return "-";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return "-";
    }
  }

  // ================= STAFF: RECENTLY ENTERED =================
  Widget _buildStaffRecentlyEntered() {
    final preview = _staffRecentEntries.take(5).toList();
    final total = _staffRecentEntries.length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Recently Entered",
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 10),
          if (_staffRecentEntries.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text(
                "No recent entries yet",
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              ),
            )
          else ...[
            ...preview.map((e) {
              final label = (e["label"] ?? "").toString();
              final date = _shortDate(e["date"]?.toString());
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF334155),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      date,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                  ],
                ),
              );
            }),
            if (total > 5) ...[
              const SizedBox(height: 8),
              Center(
                child: GestureDetector(
                  onTap: () => AppNavigator.toStaffHistory(context),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          "Show all ($total)",
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.primaryIndigo,
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(
                          CupertinoIcons.arrow_right,
                          size: 14,
                          color: AppTheme.primaryIndigo,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  // ================= SUPER ADMIN HERO BANNER =================
  Widget _buildSuperAdminHero() {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? "Good Morning"
        : hour < 17
            ? "Good Afternoon"
            : "Good Evening";

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4338CA), Color(0xFF6366F1)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF4338CA).withOpacity(0.25),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  greeting,
                  style: const TextStyle(
                    color: Color(0xB3FFFFFF),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.userName,
                  style: const TextStyle(
                    color: CupertinoColors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                const Text(
                  "Super Administrator · Office Management System",
                  style: TextStyle(
                    color: Color(0xB3FFFFFF),
                    fontSize: 11,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _heroBadge(
              count: inProgressGrievances,
              label: "In Progress",
              color: const Color(0xFFFCD34D)),
          const SizedBox(width: 8),
          _heroBadge(
              count: pendingVerifications +
                  pendingTrainRequests +
                  pendingTourDecisions,
              label: "Pending",
              color: const Color(0xFFFB7185)),
        ],
      ),
    );
  }

  Widget _heroBadge({
    required int count,
    required String label,
    required Color color,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0x26FFFFFF),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
          ),
          child: Text(
            "$count",
            style: const TextStyle(
              color: CupertinoColors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(
            color: CupertinoColors.white,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  // ================= SUPER ADMIN 4-STAT CARDS =================
  Widget _buildSuperAdminStats() {
    final cards = <Widget>[
      _superStatCard(
        icon: CupertinoIcons.doc_text,
        value: "$totalGrievances",
        label: "Total Grievances",
        sub: pendingVerifications == 0
            ? "all reviewed"
            : "$pendingVerifications pending",
        color: const Color(0xFF6366F1),
        bgColor: const Color(0xFFEEF2FF),
        onTap: () =>
            AppNavigator.toGrievanceList(context, role: widget.role),
      ),
      _superStatCard(
        icon: CupertinoIcons.news,
        value: "${_newsItems.length}",
        label: "News Intelligence",
        sub: _newsItems.isEmpty ? "no news yet" : "news entries",
        color: const Color(0xFFD97706),
        bgColor: const Color(0xFFFEF3C7),
        onTap: () =>
            AppNavigator.toNewsList(context, role: widget.role),
      ),
      _superStatCard(
        icon: CupertinoIcons.calendar,
        value: "$totalTourPrograms",
        label: "Tour Program",
        sub: pendingTourDecisions == 0
            ? "all reviewed"
            : "$pendingTourDecisions pending",
        color: const Color(0xFF16A34A),
        bgColor: const Color(0xFFDCFCE7),
        onTap: () => AppNavigator.toSuperAdminTourHub(context),
      ),
      _superStatCard(
        icon: CupertinoIcons.calendar_today,
        value: "$totalTourPrograms",
        label: "Events",
        sub: pendingTourDecisions == 0
            ? "all reviewed"
            : "$pendingTourDecisions upcoming",
        color: const Color(0xFF9333EA),
        bgColor: const Color(0xFFF3E8FF),
        onTap: () => AppNavigator.toSuperAdminEventsHub(context),
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.4,
      children: cards,
    );
  }

  Widget _superStatCard({
    required IconData icon,
    required String value,
    required String label,
    required String sub,
    required Color color,
    required Color bgColor,
    VoidCallback? onTap,
  }) {
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: const Color(0x0A000000),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub.isNotEmpty)
            Text(
              sub,
              style: const TextStyle(
                fontSize: 10,
                color: Color(0xFF94A3B8),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );

    if (onTap == null) return card;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: card,
    );
  }

  // ================= SA TODAY'S TOUR PROGRAM =================
  Widget _buildSaTourProgramCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _saCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Today's Tour Program",
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),
          if (todaySchedule.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No tour programs scheduled for today",
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            )
          else
            ...todaySchedule.take(5).map((event) {
              final time = event["dateTime"] != null
                  ? DateFormat('hh:mm a')
                      .format(DateTime.parse(event["dateTime"]).toLocal())
                  : "";
              final status =
                  (event["status"] ?? "ACCEPTED").toString().toUpperCase();
              final venue = event["venue"]?.toString() ?? "";
              final organizer = event["organizer"]?.toString() ?? "";
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3E8FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(CupertinoIcons.calendar,
                          color: Color(0xFF9333EA), size: 16),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event["eventName"]?.toString() ?? "-",
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (time.isNotEmpty) time,
                              if (venue.isNotEmpty) venue,
                              if (organizer.isNotEmpty) organizer,
                            ].join(" · "),
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF6B7280),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    _saStatusPill(status),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  // ================= SA GRIEVANCE STATUS DONUT =================
  Widget _buildSaGrievanceStatusCard() {
    final total = totalGrievances;
    final resolved = resolvedGrievances;
    final inProgress = inProgressGrievances;
    final open = openGrievances;
    final divisor = total == 0 ? 1 : total;
    final resolvedPct = ((resolved / divisor) * 100).round();
    final inProgressPct = ((inProgress / divisor) * 100).round();
    final openPct = ((open / divisor) * 100).round();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _saCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Grievance Status",
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(
                width: 110,
                height: 110,
                child: CustomPaint(
                  painter: GrievanceDonutPainter(
                    resolved: resolved.toDouble(),
                    inProgress: inProgress.toDouble(),
                    open: open.toDouble(),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          "$total",
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        const Text(
                          "Total",
                          style: TextStyle(
                            fontSize: 10,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _saLegendRow(
                        "Resolved", resolvedPct, const Color(0xFF16A34A)),
                    const SizedBox(height: 8),
                    _saLegendRow("In Progress", inProgressPct,
                        const Color(0xFFD97706)),
                    const SizedBox(height: 8),
                    _saLegendRow("Open", openPct, const Color(0xFFEF4444)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _saLegendRow(String label, int pct, Color color) {
    return Row(
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF334155),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Text(
          "$pct%",
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  // ================= SA RECENT GRIEVANCES =================
  Widget _buildSaRecentGrievancesCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _saCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Recent Grievances",
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),
          if (recentGrievances.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No grievances recorded yet",
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            )
          else
            ...recentGrievances.take(5).map((g) {
              final status = (g["status"] ?? "OPEN").toString();
              final petitioner = g["petitionerName"]?.toString() ?? "-";
              final type = g["grievanceType"]?.toString() ?? "";
              final ward = g["ward"]?.toString() ?? "";
              final amount = g["amount"];
              final amountStr = amount != null
                  ? "₹${NumberFormat('#,##0').format(num.tryParse(amount.toString()) ?? 0)}"
                  : "";
              final dateStr = _shortDate(g["createdAt"]?.toString());
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(CupertinoIcons.doc_text,
                          color: Color(0xFF6366F1), size: 16),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  petitioner,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF0F172A),
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              _saStatusPill(status),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (type.isNotEmpty) type,
                              if (ward.isNotEmpty) ward,
                              if (amountStr.isNotEmpty) amountStr,
                            ].join(" · "),
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF6B7280),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      dateStr,
                      style: const TextStyle(
                        fontSize: 10,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                  ],
                ),
              );
            }),
          if (recentGrievances.length > 5) ...[
            const SizedBox(height: 8),
            Center(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => AppNavigator.toGrievanceList(context,
                    role: widget.role),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        "Show all (${recentGrievances.length})",
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF6366F1),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        CupertinoIcons.arrow_right,
                        size: 14,
                        color: Color(0xFF6366F1),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ================= SA TODAY'S BIRTHDAYS (PINK) =================
  Widget _buildSaTodaysBirthdaysCard() {
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
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: const Color(0xFFFCE7F3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(CupertinoIcons.gift,
                    color: Color(0xFFEC4899), size: 16),
              ),
              const SizedBox(width: 10),
              const Text(
                "Today's Birthdays",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_todayBirthdaysList.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  "No birthdays today",
                  style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                ),
              ),
            )
          else
            ..._todayBirthdaysList.map(
              (b) => Padding(
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
                          fontSize: 13,
                          color: Color(0xFF0F172A),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ================= SA NEWS & INTELLIGENCE =================
  Widget _buildSaNewsIntelligenceCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _saCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => AppNavigator.toNewsList(context, role: widget.role),
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Text(
                    "News & Intelligence",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  Spacer(),
                  Icon(
                    CupertinoIcons.chevron_right,
                    size: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_newsItems.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No news posted yet",
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            )
          else
            ..._newsItems.take(5).map(_buildSaNewsRow),
          if (_newsItems.length > 5) ...[
            const SizedBox(height: 8),
            Center(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () =>
                    AppNavigator.toNewsList(context, role: widget.role),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        "Show All (${_newsItems.length})",
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF6366F1),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        CupertinoIcons.arrow_right,
                        size: 14,
                        color: Color(0xFF6366F1),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSaNewsRow(Map<String, dynamic> n) {
    final headline =
        n["headline"]?.toString() ?? n["title"]?.toString() ?? "-";
    final source =
        n["mediaSource"]?.toString() ?? n["source"]?.toString() ?? "";
    final dateStr = _shortDate(n["createdAt"]?.toString() ??
        n["publishedAt"]?.toString() ??
        n["date"]?.toString());
    final isAlert = (n["priority"]?.toString().toUpperCase() == "CRITICAL") ||
        (n["isCritical"] == true);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: isAlert ? const Color(0xFFFEF2F2) : const Color(0xFFFAFAFA),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isAlert
                ? const Color(0xFFFEE2E2)
                : const Color(0xFFE5E7EB),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isAlert
                  ? CupertinoIcons.exclamationmark_triangle
                  : CupertinoIcons.news,
              size: 16,
              color: isAlert
                  ? const Color(0xFFEF4444)
                  : const Color(0xFF6366F1),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    headline,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (source.isNotEmpty || dateStr != "-") ...[
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (source.isNotEmpty) source,
                        if (dateStr != "-") dateStr
                      ].join(" · "),
                      style: const TextStyle(
                        fontSize: 10,
                        color: Color(0xFF6B7280),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= SA SHARED HELPERS =================
  BoxDecoration _saCardDecoration() {
    return BoxDecoration(
      color: CupertinoColors.white,
      borderRadius: BorderRadius.circular(14),
      boxShadow: [
        BoxShadow(
          color: const Color(0x0A000000),
          blurRadius: 8,
          offset: const Offset(0, 2),
        ),
      ],
    );
  }

  Widget _saStatusPill(String status) {
    Color color;
    switch (status.toUpperCase()) {
      case "RESOLVED":
      case "ACCEPTED":
      case "APPROVED":
        color = const Color(0xFF16A34A);
        break;
      case "REJECTED":
        color = const Color(0xFFEF4444);
        break;
      case "IN_PROGRESS":
      case "PENDING":
        color = const Color(0xFFD97706);
        break;
      case "OPEN":
        color = const Color(0xFFEF4444);
        break;
      default:
        color = const Color(0xFF6366F1);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status.replaceAll("_", " "),
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.bold,
          color: color,
          letterSpacing: 0.3,
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
          else ...[
            ...(_adminPendingExpanded
                    ? _pendingApprovals
                    : _pendingApprovals.take(5))
                .map(_buildPendingApprovalRow),
            if (_pendingApprovals.length > 5) ...[
              const SizedBox(height: 8),
              Center(
                child: GestureDetector(
                  onTap: () => setState(
                      () => _adminPendingExpanded = !_adminPendingExpanded),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _adminPendingExpanded
                              ? "Show less"
                              : "Show all (${_pendingApprovals.length})",
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.primaryIndigo,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          _adminPendingExpanded
                              ? CupertinoIcons.chevron_up
                              : CupertinoIcons.chevron_down,
                          size: 14,
                          color: AppTheme.primaryIndigo,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildPendingApprovalRow(Map<String, dynamic> item) {
    final isOffice = item["isOffice"] == true;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        item["title"] ?? "-",
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (isOffice) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryIndigo,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          "OFFICE",
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: CupertinoColors.white,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                    ],
                  ],
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

// Helper class for staff quick-entry tiles
class _StaffEntry {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  _StaffEntry({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
}
