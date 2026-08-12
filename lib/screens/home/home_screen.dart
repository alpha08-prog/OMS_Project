import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:anki_clone/screens/birthday_page.dart';
import 'package:anki_clone/screens/history/history_page.dart';
import 'package:anki_clone/screens/tasks/task_list_page.dart';
import 'package:anki_clone/screens/tasks/staff_tasks_page.dart';
import 'package:anki_clone/screens/admin/train_queue_page.dart';
import 'package:anki_clone/screens/admin/tour_queue_page.dart';
import 'package:anki_clone/screens/admin/print_center_page.dart';
import 'package:anki_clone/screens/admin/user_management_page.dart';
import 'package:anki_clone/screens/staff/staff_history_page.dart';

import 'package:anki_clone/screens/about/about_page.dart';
import 'package:anki_clone/screens/calendar/calendar_page.dart';
import 'package:anki_clone/screens/tour/events_page.dart';

import '../../data/top_stories.dart';
import '../../data/news_data.dart';
import '../../widgets/story_card.dart';
import '../../widgets/news_card.dart';
import '../../widgets/grievance_donut_painter.dart';

import '../../services/auth_service.dart';
import '../../services/http_service.dart';
import '../../services/notification_service.dart';
import '../../services/attendance_service.dart';

import '../../utils/access_control.dart';
import '../../utils/app_navigator.dart';

import '../auth/login_screen.dart';
import '../../main.dart' show themeService;

class HomeScreen extends StatefulWidget {
  final String userName;
  final String role;

  const HomeScreen({
    super.key,
    required this.userName,
    required this.role,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  // Notification bell — polled every 30s while the screen is mounted and
  // the app is foregrounded. Updates re-rendered into AppBar Badge.
  int _unreadNotifications = 0;
  Timer? _notificationPollTimer;

  // 🎨 Saffron Govt Palette
  static const Color primarySaffron = Color(0xFFF59E0B);
  static const Color darkSaffron = Color(0xFF92400E);
  static const Color bgLight = Color(0xFFFFF7ED);
  static const Color drawerItemBg = Color(0xFF92400E);

  bool _loadingStats = true;

  int totalGrievances = 0;
  int openGrievances = 0;
  int inProgressGrievances = 0;
  int resolvedGrievances = 0;
  int visitorsToday = 0;
  int alerts = 0;
  int totalTourPrograms = 0;
  int totalTrainRequests = 0;
  int upcomingTours = 0;
  int trainReadyToPrint = 0;

  // Admin pending counts
  int pendingTrainRequests = 0;
  int pendingTourDecisions = 0;
  int todayBirthdays = 0;

  // Dashboard widget data
  List<dynamic> todaySchedule = [];
  List<dynamic> criticalNews = [];
  List<dynamic> recentGrievances = [];
  List<dynamic> recentItems = [];

  // Staff: combined recent entries (grievances, trains, tours, visitors, news)
  List<Map<String, dynamic>> _staffRecentEntries = [];

  // Staff: rejected grievances created by this staff member
  List<Map<String, dynamic>> _staffRejectedGrievances = [];
  bool _staffRejectedExpanded = true;

  // Admin dashboard data
  bool _loadingAdminDashboard = false;
  List<Map<String, dynamic>> _pendingApprovals = [];
  bool _adminPendingExpanded = false;
  List<Map<String, dynamic>> _todayBirthdaysList = [];

  // Admin: Today's Attendance summary card
  AttendanceStats? _attendanceStats;
  AttendanceRecord? _myTodayAttendance;
  bool _markingPresent = false;

  // Timestamp of the last successful dashboard stats fetch
  DateTime? _lastUpdated;

  // Super Admin extra data
  List<Map<String, dynamic>> _newsItems = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _fetchDashboardStats();
    _fetchDashboardWidgets();
    if (widget.role == Roles.admin) {
      _fetchAdminDashboard();
      _fetchAttendanceSummary();
    }
    if (widget.role == Roles.superAdmin) {
      _fetchSuperAdminExtras();
    }
    if (widget.role == Roles.staff) {
      _fetchStaffRecentEntries();
      _fetchStaffRejectedGrievances();
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

  Widget _buildNotificationBell({Color iconColor = Colors.white}) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: IconButton(
        tooltip: 'Notifications',
        icon: Badge(
          isLabelVisible: _unreadNotifications > 0,
          label: Text(
            _unreadNotifications > 99 ? '99+' : '$_unreadNotifications',
          ),
          backgroundColor: Colors.redAccent,
          child: Icon(
            _unreadNotifications > 0
                ? Icons.notifications_active
                : Icons.notifications_none,
            color: iconColor,
          ),
        ),
        onPressed: () async {
          await AppNavigator.toNotifications(context, role: widget.role);
          _refreshUnreadCount();
        },
      ),
    );
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

  Future<void> _fetchStaffRecentEntries() async {
    try {
      final futures = await Future.wait([
        HttpService.get("/api/grievances?limit=10"),
        HttpService.get("/api/train-requests?limit=10"),
        HttpService.get("/api/tour-programs?limit=10"),
        HttpService.get("/api/visitors?limit=10"),
        HttpService.get("/api/news?limit=10"),
      ]);

      List<Map<String, dynamic>> _decodeList(dynamic body) {
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
        for (final g in _decodeList(futures[0].body)) {
          final type = (g["grievanceType"] ?? "").toString().replaceAll("_", " ");
          final name = (g["petitionerName"] ?? "").toString();
          combined.add({
            "label": "Grievance – $type${name.isEmpty ? "" : " - $name"}",
            "date": g["createdAt"]?.toString(),
          });
        }
      }
      if (futures[1].statusCode == 200) {
        for (final t in _decodeList(futures[1].body)) {
          final pnr = (t["pnrNumber"] ?? "").toString();
          combined.add({
            "label": "Train EQ – PNR ${pnr.isEmpty ? "-" : pnr}",
            "date": t["createdAt"]?.toString(),
          });
        }
      }
      if (futures[2].statusCode == 200) {
        for (final tp in _decodeList(futures[2].body)) {
          final ev = (tp["eventName"] ?? "-").toString();
          combined.add({
            "label": "Tour Program – $ev",
            "date": tp["createdAt"]?.toString(),
          });
        }
      }
      if (futures[3].statusCode == 200) {
        for (final v in _decodeList(futures[3].body)) {
          final purpose = (v["purpose"] ?? "Public").toString();
          final name = (v["name"] ?? "").toString();
          combined.add({
            "label": "Visitor – $purpose${name.isEmpty ? "" : " - $name"}",
            "date": v["createdAt"]?.toString(),
          });
        }
      }
      if (futures[4].statusCode == 200) {
        for (final n in _decodeList(futures[4].body)) {
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

  Future<void> _fetchAdminDashboard() async {
    setState(() => _loadingAdminDashboard = true);
    try {
      final futures = await Future.wait([
        HttpService.get("/api/train-requests/queue/pending"),
        HttpService.get("/api/tour-programs/pending"),
        HttpService.get("/api/birthdays/today"),
      ]);

      List<Map<String, dynamic>> trains = [];
      List<Map<String, dynamic>> tours = [];
      List<Map<String, dynamic>> birthdays = [];

      if (futures[0].statusCode == 200) {
        final d = jsonDecode(futures[0].body);
        final list = d is List ? d : (d["data"] ?? []);
        trains = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[1].statusCode == 200) {
        final d = jsonDecode(futures[1].body);
        final list = d is List ? d : (d["data"] ?? []);
        tours = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (futures[2].statusCode == 200) {
        final d = jsonDecode(futures[2].body);
        final list = d is List ? d : (d["data"] ?? []);
        birthdays = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      // Build combined Pending Approvals list (Train EQ + Tour decisions)
      final combined = <Map<String, dynamic>>[];
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

      // Sort by createdAt desc (newest first)
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

  /// Admin "Today's Attendance" summary — today's totals + my own status.
  Future<void> _fetchAttendanceSummary() async {
    AttendanceStats? stats;
    AttendanceRecord? my;
    try {
      stats = await AttendanceService.getTodayStats();
    } catch (_) {}
    try {
      my = await AttendanceService.getMyToday();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      if (stats != null) _attendanceStats = stats;
      _myTodayAttendance = my;
    });
  }

  Future<void> _markPresent() async {
    setState(() => _markingPresent = true);
    try {
      await AttendanceService.mark(status: AttendanceStatus.present);
      await _fetchAttendanceSummary();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Marked present for today")),
        );
      }
    } on AttendanceException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Could not mark attendance")),
        );
      }
    } finally {
      if (mounted) setState(() => _markingPresent = false);
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
        final data = (body is Map && body["data"] != null) ? body["data"] : body;

        setState(() {
          totalGrievances = (data["grievances"]?["total"] ?? 0) as int;
          openGrievances = (data["grievances"]?["open"] ?? 0) as int;
          inProgressGrievances =
              (data["grievances"]?["inProgress"] ?? 0) as int;
          resolvedGrievances = (data["grievances"]?["resolved"] ?? 0) as int;
          visitorsToday = (data["visitorsToday"] ??
              data["visitors"]?["today"] ??
              0) as int;
          alerts = (data["alerts"] ?? data["news"]?["critical"] ?? 0) as int;
          pendingTrainRequests =
              (data["trainRequests"]?["pending"] ?? 0) as int;
          pendingTourDecisions =
              (data["tourPrograms"]?["pending"] ?? 0) as int;
          totalTourPrograms = (data["tourPrograms"]?["total"] ?? 0) as int;
          totalTrainRequests = (data["trainRequests"]?["total"] ?? 0) as int;
          upcomingTours =
              ((data["tourPrograms"]?["upcoming"]) as num?)?.toInt() ??
                  totalTourPrograms;
          trainReadyToPrint = ((data["trainRequests"]?["readyToPrint"] ??
                      data["trainRequests"]?["approved"] ??
                      data["trainRequests"]?["total"]) as num?)
                  ?.toInt() ??
              0;
          todayBirthdays = (data["birthdays"]?["today"] ??
              data["birthdaysToday"] ??
              0) as int;
          _lastUpdated = DateTime.now();
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

  Future<void> _fetchDashboardWidgets() async {
    try {
      final futures = await Future.wait([
        HttpService.get("/api/tour-programs/schedule/today"),
        HttpService.get("/api/news/alerts/critical"),
        HttpService.get("/api/grievances?limit=5"),
      ]);

      if (mounted) {
        setState(() {
          if (futures[0].statusCode == 200) {
            todaySchedule = jsonDecode(futures[0].body)["data"] ?? [];
          }
          if (futures[1].statusCode == 200) {
            criticalNews = jsonDecode(futures[1].body)["data"] ?? [];
          }
          if (futures[2].statusCode == 200) {
            recentGrievances = jsonDecode(futures[2].body)["data"] ?? [];
          }
        });
      }
    } catch (_) {}
  }

  Future<void> _logout({bool force = false}) async {
    await AuthService.logout();
    if (!mounted) return;

    if (!force) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Logged out successfully")),
      );
    }

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  void _showAccessDenied() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Access denied for role: ${widget.role}")),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSuperAdmin = widget.role == Roles.superAdmin;

    return Scaffold(
      backgroundColor: isSuperAdmin ? const Color(0xFFF6F7FB) : bgLight,
      drawer: _buildDrawer(context),

      // ================= APP BAR =================
      appBar: isSuperAdmin ? _buildSuperAdminAppBar(context) : AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [primarySaffron, darkSaffron],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
        leading: Builder(
          builder: (context) => Padding(
            padding: const EdgeInsets.all(6),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Scaffold.of(context).openDrawer(),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.menu, color: Colors.white),
              ),
            ),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Welcome,", style: TextStyle(fontSize: 12)),
            Text(
              widget.userName,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 16,
              ),
            ),
            Text(
              "Role: ${widget.role}",
              style: const TextStyle(
                fontSize: 11,
                color: Colors.white70,
              ),
            ),
          ],
        ),
        actions: [
          const Icon(Icons.search, color: Colors.white),
          const SizedBox(width: 12),
          _buildNotificationBell(),
        ],
      ),

      // ================= BODY =================
      body: RefreshIndicator(
        onRefresh: () async {
          await _fetchDashboardStats();
          await _fetchDashboardWidgets();
          if (widget.role == Roles.admin) {
            await _fetchAdminDashboard();
            await _fetchAttendanceSummary();
          }
          if (widget.role == Roles.superAdmin) {
            await _fetchSuperAdminExtras();
          }
          if (widget.role == Roles.staff) {
            await _fetchStaffRecentEntries();
            await _fetchStaffRejectedGrievances();
          }
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(16, 16, 16, isSuperAdmin ? 24 : 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // SUPER ADMIN: dashboard ONLY (full layout matching mockup)
              if (isSuperAdmin) ...[
                _buildSuperAdminHero(),
                const SizedBox(height: 16),
                _loadingStats ? _statsLoadingRow() : _buildSuperAdminStats(),
                const SizedBox(height: 20),
                _buildSaTourProgramCard(),
                const SizedBox(height: 16),
                _buildSaGrievanceStatusCard(),
                const SizedBox(height: 16),
                _buildSaRecentGrievancesCard(),
                const SizedBox(height: 16),
                _buildSaTodaysBirthdaysCard(),
                const SizedBox(height: 24),
              ],

              // ADMIN: web-parity dashboard (stat cards + attendance + quick
              // entry + action cards + needs attention + birthdays + quick actions)
              if (widget.role == Roles.admin) ...[
                _buildAdminWelcomeBanner(),
                const SizedBox(height: 16),
                _buildAdminStatCards(),
                const SizedBox(height: 16),
                _buildAdminAttendanceCard(),
                const SizedBox(height: 16),
                _buildAdminQuickEntry(),
                const SizedBox(height: 16),
                _buildAdminActionCards(),
                const SizedBox(height: 20),
                _buildAdminPendingApprovals(),
                const SizedBox(height: 16),
                _buildAdminBirthdaysCard(),
                const SizedBox(height: 20),
                _buildAdminQuickActions(),
                const SizedBox(height: 8),
              ],

              // STAFF: Data Entry Portal layout
              if (widget.role == Roles.staff) ...[
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
              ],

              // Dashboard Widgets - Today's Schedule (hidden for admin, super admin & staff)
              if (!isSuperAdmin && widget.role != Roles.admin && widget.role != Roles.staff && todaySchedule.isNotEmpty) ...[
                _sectionTitle("Today's Schedule"),
                const SizedBox(height: 12),
                _buildTodayScheduleWidget(),
                const SizedBox(height: 20),
              ],

              // Dashboard Widgets - News Alerts (hidden for admin, super admin & staff)
              if (!isSuperAdmin && widget.role != Roles.admin && widget.role != Roles.staff && criticalNews.isNotEmpty) ...[
                _sectionTitle("News Alerts"),
                const SizedBox(height: 12),
                _buildNewsAlertsWidget(),
                const SizedBox(height: 20),
              ],

              // Birthday widget (admin, super admin & staff have their own layouts)
              if (!isSuperAdmin && widget.role != Roles.admin && widget.role != Roles.staff && todayBirthdays > 0) ...[
                _buildBirthdayWidget(),
                const SizedBox(height: 20),
              ],

              // Popular Stories (hidden for admin, super admin & staff)
              if (!isSuperAdmin && widget.role != Roles.admin && widget.role != Roles.staff) ...[
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
                Divider(color: Colors.grey.shade300),
                const SizedBox(height: 18),
              ],

              // News Updates (hidden for admin, super admin & staff)
              if (!isSuperAdmin && widget.role != Roles.admin && widget.role != Roles.staff) ...[
                _sectionTitle("News Updates"),
                const SizedBox(height: 12),
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: newsList.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) =>
                      NewsCard(news: newsList[index]),
                ),
              ],
            ],
          ),
        ),
      ),

      bottomNavigationBar: isSuperAdmin ? null : _buildBottomBar(context),
    );
  }

  // ================= SUPER ADMIN APP BAR =================
  PreferredSizeWidget _buildSuperAdminAppBar(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? "Good Morning"
        : hour < 17
            ? "Good Afternoon"
            : "Good Evening";
    final dateStr = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return AppBar(
      elevation: 0,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      iconTheme: const IconThemeData(color: Color(0xFF4338CA)),
      leading: Builder(
        builder: (context) => IconButton(
          icon: const Icon(Icons.menu_rounded, color: Color(0xFF4338CA)),
          onPressed: () => Scaffold.of(context).openDrawer(),
        ),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "$greeting, Super Administrator",
            style: const TextStyle(
              color: Color(0xFF4338CA),
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          Text(
            dateStr,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
      actions: [
        _buildNotificationBell(iconColor: const Color(0xFF4338CA)),
      ],
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
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }

  // ================= STATS ROW =================
  Widget _statsRow() {
    return Row(
      children: [
        _statCard(
          icon: Icons.receipt_long,
          value: "$totalGrievances",
          label: "Grievances",
          iconBg: const Color(0xFFEFF6FF),
          iconColor: Colors.indigo,
        ),
        _statCard(
          icon: Icons.people,
          value: "$visitorsToday",
          label: "Visitors",
          iconBg: const Color(0xFFECFDF5),
          iconColor: Colors.teal,
        ),
        _statCard(
          icon: Icons.warning_amber_rounded,
          value: "$alerts",
          label: "Alerts",
          iconBg: const Color(0xFFFFF7ED),
          iconColor: Colors.orange,
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
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: iconBg,
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: Colors.grey,
              ),
            ),
          ],
        ),
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
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.userName,
                  style: const TextStyle(
                    color: Colors.white,
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
                    color: Colors.white70,
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
              count: pendingTrainRequests + pendingTourDecisions,
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
            color: Colors.white.withOpacity(0.15),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
          ),
          child: Text(
            "$count",
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
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
        icon: Icons.description_outlined,
        value: "$totalGrievances",
        label: "Total Grievances",
        sub: inProgressGrievances == 0
            ? "none in progress"
            : "$inProgressGrievances in progress",
        color: const Color(0xFF6366F1),
        bgColor: const Color(0xFFEEF2FF),
        onTap: () =>
            AppNavigator.toGrievanceList(context, role: widget.role),
      ),
      _superStatCard(
        icon: Icons.newspaper_outlined,
        value: "${_newsItems.length}",
        label: "News Intelligence",
        sub: _newsItems.isEmpty ? "no news yet" : "news entries",
        color: const Color(0xFFD97706),
        bgColor: const Color(0xFFFEF3C7),
        onTap: () =>
            AppNavigator.toNewsList(context, role: widget.role),
      ),
      _superStatCard(
        icon: Icons.event_note_outlined,
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
        icon: Icons.calendar_month_outlined,
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
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
              style: TextStyle(
                fontSize: 10,
                color: Colors.grey.shade500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: card,
      ),
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
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No tour programs scheduled for today",
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade500,
                ),
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
                      child: const Icon(Icons.event,
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
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
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
                        Text(
                          "Total",
                          style: TextStyle(
                            fontSize: 10,
                            color: Colors.grey.shade500,
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
                    _saLegendRow("Resolved", resolvedPct,
                        const Color(0xFF16A34A)),
                    const SizedBox(height: 8),
                    _saLegendRow("In Progress", inProgressPct,
                        const Color(0xFFD97706)),
                    const SizedBox(height: 8),
                    _saLegendRow(
                        "Open", openPct, const Color(0xFFEF4444)),
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
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
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
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No grievances recorded yet",
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade500,
                ),
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
                      child: const Icon(Icons.description_outlined,
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
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade600,
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
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              );
            }),
          if (recentGrievances.length > 5) ...[
            const SizedBox(height: 8),
            Center(
              child: InkWell(
                onTap: () => AppNavigator.toGrievanceList(context,
                    role: widget.role),
                borderRadius: BorderRadius.circular(8),
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
                        Icons.arrow_forward,
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
                child: const Icon(Icons.cake,
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
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  "No birthdays today",
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
              ),
            )
          else
            ..._todayBirthdaysList.map(
              (b) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    const Icon(Icons.person,
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
          InkWell(
            onTap: () =>
                AppNavigator.toNewsList(context, role: widget.role),
            borderRadius: BorderRadius.circular(6),
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
                    Icons.arrow_forward_ios,
                    size: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_newsItems.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "No news posted yet",
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade500,
                ),
              ),
            )
          else
            ..._newsItems.take(5).map(_buildSaNewsRow),
          if (_newsItems.length > 5) ...[
            const SizedBox(height: 8),
            Center(
              child: InkWell(
                onTap: () => AppNavigator.toNewsList(
                  context,
                  role: widget.role,
                ),
                borderRadius: BorderRadius.circular(8),
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
                        Icons.arrow_forward,
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
    final headline = n["headline"]?.toString() ?? n["title"]?.toString() ?? "-";
    final source = n["mediaSource"]?.toString() ?? n["source"]?.toString() ?? "";
    final dateStr = _shortDate(n["createdAt"]?.toString() ??
        n["publishedAt"]?.toString() ??
        n["date"]?.toString());
    final isAlert =
        (n["priority"]?.toString().toUpperCase() == "CRITICAL") ||
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
                  ? Icons.warning_amber_rounded
                  : Icons.article_outlined,
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
                      [if (source.isNotEmpty) source, if (dateStr != "-") dateStr]
                          .join(" · "),
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey.shade600,
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
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.04),
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

  // ================= TODAY'S SCHEDULE WIDGET =================
  Widget _buildTodayScheduleWidget() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: todaySchedule.take(5).map((event) {
          final time = event["dateTime"] != null
              ? DateFormat('hh:mm a').format(DateTime.parse(event["dateTime"]).toLocal())
              : "";
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Container(
                  width: 4, height: 36,
                  decoration: BoxDecoration(color: Colors.purple, borderRadius: BorderRadius.circular(2)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(event["eventName"] ?? "", style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text("$time - ${event["venue"] ?? ""}", style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ],
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ================= NEWS ALERTS WIDGET =================
  Widget _buildNewsAlertsWidget() {
    return Column(
      children: criticalNews.take(3).map((news) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFEF2F2),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFFEE2E2)),
          ),
          child: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(news["headline"] ?? "", style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(news["mediaSource"] ?? "", style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ================= RECENT GRIEVANCES WIDGET =================
  Widget _buildRecentGrievancesWidget() {
    return Column(
      children: recentGrievances.take(5).map((g) {
        final status = g["status"] ?? "OPEN";
        final statusColor = status == "RESOLVED" ? const Color(0xFF16A34A)
            : status == "REJECTED" ? const Color(0xFFEF4444)
            : status == "IN_PROGRESS" ? Colors.orange
            : Colors.blue;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4, offset: const Offset(0, 1))],
          ),
          child: Row(
            children: [
              Container(width: 4, height: 40, decoration: BoxDecoration(color: statusColor, borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(g["petitionerName"] ?? "", style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text("${g["grievanceType"] ?? ""} - ${g["constituency"] ?? ""}", style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                child: Text(status, style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ================= RECENT ITEMS (Staff) =================
  Widget _buildRecentItems() {
    return Column(
      children: recentGrievances.take(3).map((g) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4, offset: const Offset(0, 1))],
          ),
          child: Row(
            children: [
              CircleAvatar(radius: 16, backgroundColor: Colors.indigo.withOpacity(0.1), child: const Icon(Icons.receipt_long, size: 16, color: Colors.indigo)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(g["petitionerName"] ?? "", style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(g["grievanceType"] ?? "", style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ================= BIRTHDAY WIDGET =================
  Widget _buildBirthdayWidget() {
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BirthdayPage(role: widget.role))),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFFDF2F8), Color(0xFFFCE7F3)]),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFBCFE8)),
        ),
        child: Row(
          children: [
            const CircleAvatar(radius: 20, backgroundColor: Color(0xFFEC4899), child: Icon(Icons.cake, color: Colors.white, size: 20)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Birthdays Today", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  Text("$todayBirthdays people have birthdays today", style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  // ================= PENDING ACTIONS (Admin) =================
  Widget _buildPendingActionsGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.2,
      children: [
        _pendingActionCard(
          icon: Icons.train,
          label: "Train Approvals",
          count: pendingTrainRequests,
          color: Colors.blue,
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TrainQueuePage())),
        ),
        _pendingActionCard(
          icon: Icons.event,
          label: "Tour Decisions",
          count: pendingTourDecisions,
          color: Colors.purple,
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TourQueuePage())),
        ),
        _pendingActionCard(
          icon: Icons.print,
          label: "Print Center",
          count: 0,
          color: Colors.teal,
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrintCenterPage())),
        ),
      ],
    );
  }

  Widget _pendingActionCard({
    required IconData icon,
    required String label,
    required int count,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: color.withOpacity(0.1),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  if (count > 0)
                    Text("$count pending",
                        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= STAFF: DATA ENTRY PORTAL =================
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
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
        icon: Icons.description_outlined,
        label: "New Grievance",
        color: const Color(0xFFF59E0B),
        onTap: () =>
            AppNavigator.toGrievanceEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: Icons.train,
        label: "Train EQ",
        color: const Color(0xFFF59E0B),
        onTap: () =>
            AppNavigator.toTrainRequestEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: Icons.people_outline,
        label: "Visitor / Birthday",
        color: const Color(0xFF1E293B),
        onTap: () => AppNavigator.toAddPerson(context),
      ),
      _StaffEntry(
        icon: Icons.event_outlined,
        label: "Tour Program",
        color: const Color(0xFF0284C7),
        onTap: () =>
            AppNavigator.toTourProgramEntry(context, role: widget.role),
      ),
      _StaffEntry(
        icon: Icons.article_outlined,
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

  // Admin Quick Entry — same tiles as staff but routed to the create forms,
  // matching the web admin dashboard.
  // ================= ADMIN: TOP STAT CARDS =================
  Widget _buildAdminStatCards() {
    final cards = <Widget>[
      _adminStatCard(
        icon: Icons.description_outlined,
        value: "$openGrievances",
        label: "Open Grievances",
        sub: "$totalGrievances total · $resolvedGrievances resolved",
        color: const Color(0xFF6366F1),
        bgColor: const Color(0xFFEEF2FF),
        onTap: () => AppNavigator.toGrievanceList(context, role: widget.role),
      ),
      _adminStatCard(
        icon: Icons.train_outlined,
        value: "$trainReadyToPrint",
        label: "Train EQ Letters",
        sub: "Auto-approved · ready to print",
        color: const Color(0xFF7C3AED),
        bgColor: const Color(0xFFF3E8FF),
        onTap: () => AppNavigator.toTrainQueue(context),
      ),
      _adminStatCard(
        icon: Icons.event_note_outlined,
        value: "$upcomingTours",
        label: "Upcoming Tours",
        sub: pendingTourDecisions == 0
            ? "No pending decisions"
            : pendingTourDecisions == 1
                ? "1 awaiting decision"
                : "$pendingTourDecisions awaiting decision",
        color: const Color(0xFFD97706),
        bgColor: const Color(0xFFFEF3C7),
        onTap: () => AppNavigator.toTourQueue(context),
      ),
      _adminStatCard(
        icon: Icons.people_outline,
        value: "$visitorsToday",
        label: "Visitors Today",
        sub: todayBirthdays == 1
            ? "1 birthday today"
            : "$todayBirthdays birthdays today",
        color: const Color(0xFF16A34A),
        bgColor: const Color(0xFFDCFCE7),
        onTap: () => AppNavigator.toVisitorList(context, role: widget.role),
      ),
    ];

    // Fix the card HEIGHT (not the aspect ratio) so cells never get shorter
    // than their content on narrow screens — that was causing a bottom
    // overflow. Aspect ratio is derived from the measured width per device.
    return LayoutBuilder(
      builder: (context, constraints) {
        const spacing = 12.0;
        const cardHeight = 138.0;
        final cardWidth = (constraints.maxWidth - spacing) / 2;
        return GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: spacing,
          crossAxisSpacing: spacing,
          childAspectRatio: cardWidth / cardHeight,
          children: cards,
        );
      },
    );
  }

  Widget _adminStatCard({
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
              Icon(Icons.arrow_forward, size: 15, color: Colors.grey.shade400),
            ],
          ),
          const SizedBox(height: 10),
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
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            sub,
            style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: card,
      ),
    );
  }

  // ================= ADMIN: TODAY'S ATTENDANCE =================
  Widget _buildAdminAttendanceCard() {
    final stats = _attendanceStats;
    final my = _myTodayAttendance;
    final youLabel =
        my == null ? "Not marked present yet." : "Marked ${my.status.label}.";

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.how_to_reg_outlined,
                    color: Color(0xFF4338CA), size: 18),
              ),
              const SizedBox(width: 10),
              const Text(
                "Today's Attendance",
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1E1B4B),
                ),
              ),
              const Spacer(),
              InkWell(
                onTap: () => AppNavigator.toStaffAttendance(context),
                borderRadius: BorderRadius.circular(8),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text(
                    "View full",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF4338CA),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: RichText(
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    text: TextSpan(
                      children: [
                        const TextSpan(
                          text: "You:  ",
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF334155),
                          ),
                        ),
                        TextSpan(
                          text: youLabel,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                if (my == null)
                  ElevatedButton.icon(
                    onPressed: _markingPresent ? null : _markPresent,
                    icon: _markingPresent
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_circle_outline, size: 16),
                    label: Text(_markingPresent ? "Marking…" : "Mark present"),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16A34A),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDCFCE7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check_circle,
                            size: 14, color: Color(0xFF16A34A)),
                        const SizedBox(width: 4),
                        Text(
                          my.status.label,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF15803D),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _attnTile("PRESENT", stats?.present ?? 0,
                  const Color(0xFF16A34A), const Color(0xFFF0FDF4),
                  const Color(0xFFBBF7D0)),
              _attnTile("HALF DAY", stats?.halfDay ?? 0,
                  const Color(0xFFB45309), const Color(0xFFFFFBEB),
                  const Color(0xFFFDE68A)),
              _attnTile("LEAVE", stats?.leave ?? 0, const Color(0xFF2563EB),
                  const Color(0xFFEFF6FF), const Color(0xFFBFDBFE)),
              _attnTile("ABSENT", stats?.absent ?? 0, const Color(0xFFDC2626),
                  const Color(0xFFFEF2F2), const Color(0xFFFECACA),
                  last: true),
            ],
          ),
        ],
      ),
    );
  }

  Widget _attnTile(
    String label,
    int count,
    Color textColor,
    Color bgColor,
    Color borderColor, {
    bool last = false,
  }) {
    return Expanded(
      child: Container(
        margin: EdgeInsets.only(right: last ? 0 : 8),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
                color: textColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "$count",
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= ADMIN: QUICK ACTIONS =================
  Widget _buildAdminQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 10),
          child: Text(
            "Quick Actions",
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1E1B4B),
            ),
          ),
        ),
        SizedBox(
          height: 92,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _quickActionCard(Icons.receipt_long, "Grievances",
                  const Color(0xFF6366F1),
                  () => AppNavigator.toGrievanceList(context, role: widget.role)),
              _quickActionCard(Icons.print, "Print\nCenter",
                  const Color(0xFF0EA5E9),
                  () => AppNavigator.toPrintCenter(context)),
              _quickActionCard(Icons.train, "Train EQ", const Color(0xFF7C3AED),
                  () => AppNavigator.toTrainQueue(context)),
              _quickActionCard(Icons.event_note, "Tour\nDecisions",
                  const Color(0xFFD97706),
                  () => AppNavigator.toTourQueue(context)),
              _quickActionCard(Icons.people, "Visitors", const Color(0xFF0D9488),
                  () => AppNavigator.toVisitorList(context, role: widget.role)),
              _quickActionCard(Icons.newspaper, "News", const Color(0xFFDB2777),
                  () => AppNavigator.toNewsList(context, role: widget.role)),
              _quickActionCard(Icons.cake, "Birthdays", const Color(0xFFEC4899),
                  () => AppNavigator.toBirthdayView(context)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAdminQuickEntry() {
    final entries = <_StaffEntry>[
      _StaffEntry(
        icon: Icons.description_outlined,
        label: "New Grievance",
        color: const Color(0xFFF59E0B),
        onTap: () => AppNavigator.toOfficeGrievanceCreate(context),
      ),
      _StaffEntry(
        icon: Icons.train,
        label: "Train EQ",
        color: const Color(0xFF6366F1),
        onTap: () =>
            AppNavigator.toTrainRequestAdd(context, role: widget.role),
      ),
      _StaffEntry(
        icon: Icons.people_outline,
        label: "Visitor / Birthday",
        color: const Color(0xFF1E293B),
        onTap: () => AppNavigator.toAddPerson(context),
      ),
      _StaffEntry(
        icon: Icons.event_outlined,
        label: "Tour Program",
        color: const Color(0xFF0284C7),
        onTap: () =>
            AppNavigator.toTourProgramCreate(context, role: widget.role),
      ),
      _StaffEntry(
        icon: Icons.article_outlined,
        label: "News Entry",
        color: const Color(0xFF0D9488),
        onTap: () => AppNavigator.toNewsAdd(context),
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
              final cardWidth = (width - spacing * (perRow - 1)) / perRow;
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
    return Material(
      color: e.color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: e.onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(e.icon, color: Colors.white, size: 22),
              const SizedBox(height: 8),
              Text(
                e.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
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
            child: Icon(Icons.circle, size: 5, color: Color(0xFF64748B)),
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
              InkWell(
                onTap: () => setState(
                    () => _staffRejectedExpanded = !_staffRejectedExpanded),
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: const EdgeInsets.all(2),
                  child: Icon(
                    _staffRejectedExpanded
                        ? Icons.keyboard_arrow_down
                        : Icons.keyboard_arrow_right,
                    color: const Color(0xFF334155),
                    size: 22,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.cancel_outlined, color: accent, size: 20),
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
              InkWell(
                onTap: () => AppNavigator.toRejectedGrievances(context,
                    role: widget.role),
                borderRadius: BorderRadius.circular(8),
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

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => AppNavigator.toGrievanceView(
          context,
          grievanceData: g,
          role: widget.role,
        ),
        child: Padding(
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

  Widget _buildStaffRecentlyEntered() {
    final preview = _staffRecentEntries.take(5).toList();
    final total = _staffRecentEntries.length;

    return _staffSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _staffSectionTitle("Recently Entered"),
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
                child: InkWell(
                  onTap: () => AppNavigator.toStaffHistory(context),
                  borderRadius: BorderRadius.circular(8),
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
                            color: Color(0xFF6366F1),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(
                          Icons.arrow_forward,
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
        ],
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
              Icons.receipt_long,
              widget.role == Roles.staff ? "New\nGrievance" : "Grievances",
              Colors.indigo, () {
            AppNavigator.toGrievanceEntry(context, role: widget.role);
          }),
          _quickActionCard(Icons.train, "Train\nRequest", Colors.blue, () {
            AppNavigator.toTrainRequestEntry(context, role: widget.role);
          }),
          _quickActionCard(Icons.people, "Visitor\nEntry", Colors.teal, () {
            AppNavigator.toVisitorEntry(context, role: widget.role);
          }),
          _quickActionCard(
              Icons.event,
              widget.role == Roles.staff ? "Add\nInvitation" : "Tour\nProgram",
              Colors.purple, () {
            AppNavigator.toTourProgramEntry(context, role: widget.role);
          }),
          _quickActionCard(
              Icons.newspaper,
              widget.role == Roles.staff ? "Add\nNews" : "News\nEntry",
              Colors.orange, () {
            AppNavigator.toNewsEntry(context, role: widget.role);
          }),
        ],
      ),
    );
  }

  Widget _quickActionCard(IconData icon, String label, Color color, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 80,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6, offset: const Offset(0, 2)),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 6),
              Text(label, textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
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
        color: Colors.black87,
      ),
    );
  }

  // ================= ADMIN DASHBOARD WIDGETS =================

  Widget _buildAdminWelcomeBanner() {
    final dateStr = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());
    final updatedStr = _lastUpdated == null
        ? null
        : DateFormat('hh:mm a').format(_lastUpdated!);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
                    Text(
                      dateStr,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.access_time, size: 13, color: Colors.grey.shade500),
              const SizedBox(width: 4),
              Text(
                updatedStr == null ? "Updating…" : "Updated $updatedStr",
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
              const Spacer(),
              InkWell(
                onTap: () {
                  _fetchDashboardStats();
                  _fetchDashboardWidgets();
                  _fetchAdminDashboard();
                  _fetchAttendanceSummary();
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.refresh, size: 14, color: Color(0xFF4338CA)),
                      SizedBox(width: 4),
                      Text(
                        "Refresh",
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF4338CA),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAdminActionCards() {
    final cards = [
      _AdminCardData(
        icon: Icons.description_outlined,
        title: "Grievances",
        subtitle: "View and manage grievances",
        buttonLabel: "Open List",
        onTap: () =>
            AppNavigator.toGrievanceList(context, role: widget.role),
      ),
      _AdminCardData(
        icon: Icons.print_outlined,
        title: "Print Letters",
        subtitle: "Generate and print official letters",
        buttonLabel: "Print Center",
        onTap: () => Navigator.push(context,
            MaterialPageRoute(builder: (_) => const PrintCenterPage())),
      ),
      _AdminCardData(
        icon: Icons.train_outlined,
        title: "Train EQ Letters",
        subtitle: pendingTrainRequests == 1
            ? "1 pending approval"
            : "$pendingTrainRequests pending approval",
        buttonLabel: "View Requests",
        onTap: () => Navigator.push(context,
            MaterialPageRoute(builder: (_) => const TrainQueuePage())),
      ),
      _AdminCardData(
        icon: Icons.event_note_outlined,
        title: "Tour Decisions",
        subtitle: pendingTourDecisions == 1
            ? "1 pending decisions"
            : "$pendingTourDecisions pending decisions",
        buttonLabel: "Review",
        onTap: () => Navigator.push(context,
            MaterialPageRoute(builder: (_) => const TourQueuePage())),
      ),
    ];

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 0.95,
      children: cards.map(_buildAdminActionCard).toList(),
    );
  }

  Widget _buildAdminActionCard(_AdminCardData c) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
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
            child:
                Icon(c.icon, color: const Color(0xFF4338CA), size: 20),
          ),
          const SizedBox(height: 10),
          Text(
            c.title,
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
            c.subtitle,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey.shade600,
              height: 1.3,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: c.onTap,
              style: ElevatedButton.styleFrom(
                backgroundColor: primarySaffron,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 8),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                textStyle: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.bold),
              ),
              child: Text(c.buttonLabel),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
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
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.red.shade100,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  "${_pendingApprovals.length} Pending",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Colors.red.shade700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingAdminDashboard)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 30),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_pendingApprovals.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.check_circle_outline,
                        size: 40, color: Colors.green.shade400),
                    const SizedBox(height: 8),
                    Text(
                      "All caught up — no pending approvals",
                      style: TextStyle(
                          color: Colors.grey.shade600, fontSize: 12),
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
                child: InkWell(
                  onTap: () => setState(
                      () => _adminPendingExpanded = !_adminPendingExpanded),
                  borderRadius: BorderRadius.circular(8),
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
                            color: Color(0xFF6366F1),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          _adminPendingExpanded
                              ? Icons.keyboard_arrow_up
                              : Icons.keyboard_arrow_down,
                          size: 16,
                          color: const Color(0xFF6366F1),
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
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: () => _onApprovalRowTap(item),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF4338CA),
              side: BorderSide(color: const Color(0xFF4338CA).withOpacity(0.4)),
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              textStyle: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600),
            ),
            child: const Text("Review"),
          ),
        ],
      ),
    );
  }

  void _onApprovalRowTap(Map<String, dynamic> item) {
    final kind = item["_kind"];
    if (kind == "train") {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => const TrainQueuePage(),
      ));
    } else if (kind == "tour") {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => const TourQueuePage(),
      ));
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
                child: const Icon(Icons.cake,
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
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  "No birthdays today",
                  style: TextStyle(
                    color: Colors.grey.shade600,
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
                      const Icon(Icons.person, size: 14, color: Color(0xFFEC4899)),
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

  // ================= BOTTOM BAR (UPDATED) =================
  // ✅ Added Tour Programs button
  Widget _buildBottomBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          // Staff bottom-nav opens LIST/view screens (creation lives in the
          // Quick Entry cards up top); admin routing is left unchanged.
          _bottomButton(
              Icons.receipt_long,
              widget.role == Roles.staff ? "Grievance" : "Grievances", () {
            if (widget.role == Roles.staff) {
              AppNavigator.toGrievanceList(context, role: widget.role);
            } else {
              AppNavigator.toGrievanceEntry(context, role: widget.role);
            }
          }),

          _bottomButton(Icons.people_alt, "Visitors", () {
            if (widget.role == Roles.staff) {
              AppNavigator.toVisitorList(context, role: widget.role);
            } else {
              AppNavigator.toVisitorEntry(context, role: widget.role);
            }
          }),

          _bottomButton(Icons.cake, "Birthdays", () {
            if (widget.role == Roles.staff) {
              AppNavigator.toBirthdayView(context);
            } else {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => BirthdayPage(role: widget.role),
                ),
              );
            }
          }),

          _bottomButton(Icons.train, "Train\nRequests", () {
            if (widget.role == Roles.staff) {
              AppNavigator.toTrainRequestList(context, role: widget.role);
            } else {
              AppNavigator.toTrainRequestEntry(context, role: widget.role);
            }
          }),

          if (widget.role == Roles.admin)
            _bottomButton(Icons.star_outline, "Events", () {
              AppNavigator.toEvents(context, role: widget.role);
            })
          else
            _bottomButton(Icons.event, "Tour\nPrograms", () {
              if (widget.role == Roles.staff) {
                AppNavigator.toTourProgramList(context, role: widget.role);
              } else {
                AppNavigator.toTourProgramEntry(context, role: widget.role);
              }
            }),
        ],
      ),
    );
  }

  Widget _bottomButton(
    IconData icon,
    String label,
    VoidCallback onTap,
  ) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: primarySaffron, size: 26),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ================= DRAWER =================
  Drawer _buildDrawer(BuildContext context) {
    return Drawer(
      backgroundColor: primarySaffron,
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 24),
            const CircleAvatar(
              radius: 40,
              backgroundColor: Colors.white,
              child: Icon(Icons.person, size: 45, color: darkSaffron),
            ),
            const SizedBox(height: 12),
            Text(
              widget.userName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Role: ${widget.role}",
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 30),

            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: widget.role == Roles.superAdmin
                    ? _buildSuperAdminDrawerItems(context)
                    : widget.role == Roles.admin
                        ? _buildAdminDrawerItems(context)
                        : widget.role == Roles.staff
                            ? _buildStaffDrawerItems(context)
                            : _buildDefaultDrawerItems(context),
            ),
            ),
          ],
        ),
      ),
    );
  }

  // Super-admin drawer — dashboard-only access.
  List<Widget> _buildSuperAdminDrawerItems(BuildContext context) {
    return [
      _drawerItem(Icons.dashboard, "Dashboard", onTap: () {
        Navigator.pop(context);
      }),
      _drawerItem(Icons.account_circle_outlined, "My Profile", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMyProfile(context);
      }),
      _drawerItem(Icons.groups_outlined, "About Team", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const AboutPage(),
        ));
      }),
      const Divider(color: Colors.white30, indent: 16, endIndent: 16),
      _drawerItem(Icons.logout, "Logout", onTap: () async => _logout()),
    ];
  }

  // Curated staff drawer — only the items shown in the spec.
  List<Widget> _buildStaffDrawerItems(BuildContext context) {
    return [
      _drawerItem(Icons.dashboard, "Dashboard", onTap: () {
        Navigator.pop(context);
      }),
      _drawerItem(Icons.assignment_outlined, "My Tasks", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const StaffTasksPage(),
        ));
      }),
      _drawerItem(Icons.list_alt, "All Tasks", onTap: () {
        Navigator.pop(context);
        AppNavigator.toAllTasks(context, role: widget.role);
      }),
      _drawerItem(Icons.move_to_inbox_outlined, "Forwarded to Me", onTap: () {
        Navigator.pop(context);
        AppNavigator.toForwardedTasks(context);
      }),
      _drawerItem(Icons.event_available, "My Attendance", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMyAttendance(context);
      }),
      _drawerItem(Icons.history, "My History", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const StaffHistoryPage(),
        ));
      }),
      _drawerItem(
        Icons.description_outlined,
        "Grievance",
        trailing: Icons.chevron_right,
        onTap: () {
          Navigator.pop(context);
          AppNavigator.toGrievanceEntry(context, role: widget.role);
        },
      ),
      _drawerItem(Icons.people_alt_outlined, "Add Visitor/Birthday", onTap: () {
        Navigator.pop(context);
        AppNavigator.toAddPerson(context);
      }),
      _drawerItem(Icons.cake, "View Birthdays", onTap: () {
        Navigator.pop(context);
        AppNavigator.toBirthdayView(context);
      }),
      _drawerItem(Icons.train, "Train EQ Request", onTap: () {
        Navigator.pop(context);
        AppNavigator.toTrainRequestAdd(context, role: widget.role);
      }),
      _drawerItem(Icons.calendar_today_outlined, "Add Invitation", onTap: () {
        Navigator.pop(context);
        AppNavigator.toInvitationAdd(context);
      }),
      _drawerItem(Icons.star_outline, "Event Reports", onTap: () {
        Navigator.pop(context);
        AppNavigator.toEventReports(context);
      }),
      _drawerItem(Icons.newspaper, "Add News", onTap: () {
        Navigator.pop(context);
        AppNavigator.toNewsAdd(context);
      }),
      _drawerItem(Icons.print, "Print Center", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const PrintCenterPage(),
        ));
      }),
      _drawerItem(Icons.groups_outlined, "About Team", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const AboutPage(),
        ));
      }),
      _drawerItem(Icons.account_circle_outlined, "My Profile", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMyProfile(context);
      }),
      const Divider(color: Colors.white30, indent: 16, endIndent: 16),
      _drawerItem(Icons.logout, "Logout", onTap: () async => _logout()),
    ];
  }

  // Curated admin drawer — only the items shown in the spec.
  List<Widget> _buildAdminDrawerItems(BuildContext context) {
    return [
      _drawerItem(Icons.dashboard, "Dashboard", onTap: () {
        Navigator.pop(context);
      }),
      _drawerItem(Icons.trending_up, "Task Tracker", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => TaskListPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.list_alt, "All Tasks", onTap: () {
        Navigator.pop(context);
        AppNavigator.toAllTasks(context, role: widget.role);
      }),
      _drawerItem(Icons.work_outline, "Office Tasks", onTap: () {
        Navigator.pop(context);
        AppNavigator.toOfficeTasks(context, role: widget.role);
      }),
      _drawerItem(Icons.move_to_inbox_outlined, "Forwarded to Me", onTap: () {
        Navigator.pop(context);
        AppNavigator.toForwardedTasks(context);
      }),
      // --- Entry / create actions ---
      _drawerItem(Icons.note_add_outlined, "New Grievance", onTap: () {
        Navigator.pop(context);
        AppNavigator.toOfficeGrievanceCreate(context);
      }),
      _drawerItem(Icons.person_add_alt, "Add Visitor/Birthday", onTap: () {
        Navigator.pop(context);
        AppNavigator.toAddPerson(context);
      }),
      _drawerItem(Icons.train_outlined, "Train EQ Request", onTap: () {
        Navigator.pop(context);
        AppNavigator.toTrainRequestAdd(context, role: widget.role);
      }),
      _drawerItem(Icons.map_outlined, "Tour Program", onTap: () {
        Navigator.pop(context);
        AppNavigator.toTourProgramCreate(context, role: widget.role);
      }),
      _drawerItem(Icons.post_add_outlined, "News Entry", onTap: () {
        Navigator.pop(context);
        AppNavigator.toNewsAdd(context);
      }),
      _drawerItem(Icons.train, "Train EQ Queue", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const TrainQueuePage(),
        ));
      }),
      _drawerItem(Icons.event_available, "Tour Invitations", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const TourQueuePage(),
        ));
      }),
      _drawerItem(Icons.star_outline, "Events", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => EventsPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.calendar_month, "Calendar", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => CalendarPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.groups_2_outlined, "Meetings", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMeetings(context);
      }),
      _drawerItem(Icons.people_alt_outlined, "View Visitors", onTap: () {
        Navigator.pop(context);
        AppNavigator.toVisitorList(context, role: widget.role);
      }),
      _drawerItem(Icons.newspaper, "News Feed", onTap: () {
        Navigator.pop(context);
        AppNavigator.toNewsList(context, role: widget.role);
      }),
      _drawerItem(Icons.print, "Print Center", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const PrintCenterPage(),
        ));
      }),
      _drawerItem(Icons.event_available, "Staff Attendance", onTap: () {
        Navigator.pop(context);
        AppNavigator.toStaffAttendance(context);
      }),
      _drawerItem(Icons.history_toggle_off, "Action History", onTap: () {
        Navigator.pop(context);
        AppNavigator.toActionHistory(context);
      }),
      _drawerItem(Icons.timeline, "Activity Log", onTap: () {
        Navigator.pop(context);
        AppNavigator.toActivityLog(context);
      }),
      _drawerItem(Icons.cake_outlined, "View Birthdays", onTap: () {
        Navigator.pop(context);
        AppNavigator.toBirthdayView(context);
      }),
      _drawerItem(Icons.people_outline, "User Management", onTap: () {
        Navigator.pop(context);
        AppNavigator.toUserManagement(context);
      }),
      _drawerItem(Icons.groups_outlined, "About Team", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const AboutPage(),
        ));
      }),
      _drawerItem(Icons.account_circle_outlined, "My Profile", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMyProfile(context);
      }),
      const Divider(color: Colors.white30, indent: 16, endIndent: 16),
      _drawerItem(Icons.logout, "Logout", onTap: () async => _logout()),
    ];
  }

  // Default drawer for staff and super-admin (unchanged behaviour).
  List<Widget> _buildDefaultDrawerItems(BuildContext context) {
    return [
      _drawerItem(
          Icons.receipt_long,
          widget.role == Roles.staff ? "Grievance" : "Grievances",
          onTap: () {
        Navigator.pop(context);
        AppNavigator.toGrievanceEntry(context, role: widget.role);
      }),
      _drawerItem(Icons.people_alt, "Visitors", onTap: () {
        Navigator.pop(context);
        AppNavigator.toVisitorEntry(context, role: widget.role);
      }),
      _drawerItem(Icons.cake, "Birthdays", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => BirthdayPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.train, "Train Requests", onTap: () {
        Navigator.pop(context);
        AppNavigator.toTrainRequestEntry(context, role: widget.role);
      }),
      _drawerItem(
          Icons.event,
          widget.role == Roles.staff ? "Add Invitation" : "Tour Programs",
          onTap: () {
        Navigator.pop(context);
        AppNavigator.toTourProgramEntry(context, role: widget.role);
      }),
      _drawerItem(
          Icons.newspaper,
          widget.role == Roles.staff ? "Add News" : "News & Intelligence",
          onTap: () {
        Navigator.pop(context);
        AppNavigator.toNewsEntry(context, role: widget.role);
      }),
      _drawerItem(Icons.calendar_month, "Calendar", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => CalendarPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.event_note, "Past Events", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => EventsPage(role: widget.role),
        ));
      }),

      // Super-admin — gets the full admin toolset
      if (widget.role == Roles.superAdmin) ...[
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Divider(color: Colors.white24),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text("ADMIN",
              style: TextStyle(
                  color: Colors.white54,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1)),
        ),
        const SizedBox(height: 4),
        _drawerItem(Icons.train, "Train EQ Queue", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const TrainQueuePage(),
          ));
        }),
        _drawerItem(Icons.event_available, "Tour Decisions", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const TourQueuePage(),
          ));
        }),
        _drawerItem(Icons.task_alt, "Task Tracker", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => TaskListPage(role: widget.role),
          ));
        }),
        _drawerItem(Icons.history_toggle_off, "Action History", onTap: () {
          Navigator.pop(context);
          AppNavigator.toActionHistory(context);
        }),
        _drawerItem(Icons.cake_outlined, "View Birthdays", onTap: () {
          Navigator.pop(context);
          AppNavigator.toBirthdayView(context);
        }),
        _drawerItem(Icons.print, "Print Center", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const PrintCenterPage(),
          ));
        }),
        _drawerItem(Icons.people_outline, "User Management", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const UserManagementPage(),
          ));
        }),
      ],

      // Staff-only sections
      if (widget.role == Roles.staff) ...[
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Divider(color: Colors.white24),
        ),
        _drawerItem(Icons.task, "My Tasks", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const StaffTasksPage(),
          ));
        }),
        _drawerItem(Icons.history_edu, "My Submissions", onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => const StaffHistoryPage(),
          ));
        }),
        _drawerItem(Icons.fact_check, "Event Reports", onTap: () {
          Navigator.pop(context);
          AppNavigator.toEventReports(context);
        }),
      ],

      // Common sections
      const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Divider(color: Colors.white24),
      ),
      _drawerItem(Icons.history, "Activity History", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => HistoryPage(role: widget.role),
        ));
      }),
      _drawerItem(Icons.account_circle_outlined, "My Profile", onTap: () {
        Navigator.pop(context);
        AppNavigator.toMyProfile(context);
      }),
      _drawerItem(
        themeService.isDark ? Icons.light_mode : Icons.dark_mode,
        themeService.isDark ? "Light Mode" : "Dark Mode",
        onTap: () {
          themeService.toggleTheme();
          Navigator.pop(context);
        },
      ),
      _drawerItem(Icons.info_outline, "About Us", onTap: () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(
          builder: (_) => const AboutPage(),
        ));
      }),
      const Divider(color: Colors.white30),
      _drawerItem(Icons.logout, "Logout", onTap: () async => _logout()),
    ];
  }

  Widget _drawerItem(
    IconData icon,
    String title, {
    VoidCallback? onTap,
    IconData? trailing,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        splashColor: Colors.white24,
        onTap: onTap ?? () {},
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: drawerItemBg,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 22),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (trailing != null)
                Icon(trailing, color: Colors.white70, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _AdminCardData {
  final IconData icon;
  final String title;
  final String subtitle;
  final String buttonLabel;
  final VoidCallback onTap;
  const _AdminCardData({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
    required this.onTap,
  });
}

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
