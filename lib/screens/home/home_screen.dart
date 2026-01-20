import 'dart:convert';

import 'package:flutter/material.dart';

import 'package:anki_clone/screens/birthday_page.dart';
import 'package:anki_clone/screens/grievance/grievance_list_page.dart';
import 'package:anki_clone/screens/visitors/visitor_list_page.dart';
import 'package:anki_clone/screens/train/train_request_list_page.dart';
import 'package:anki_clone/screens/tour/tour_program_list_page.dart'; // ✅ NEW

import '../../data/top_stories.dart';
import '../../data/news_data.dart';
import '../../widgets/story_card.dart';
import '../../widgets/news_card.dart';

import '../../services/auth_service.dart';
import '../../services/http_service.dart';

import '../../utils/access_control.dart';

import '../auth/login_screen.dart';

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

class _HomeScreenState extends State<HomeScreen> {
  // 🎨 Saffron Govt Palette
  static const Color primarySaffron = Color(0xFFF59E0B);
  static const Color darkSaffron = Color(0xFF92400E);
  static const Color bgLight = Color(0xFFFFF7ED);
  static const Color drawerItemBg = Color(0xFF92400E);

  bool _loadingStats = true;

  int totalGrievances = 0;
  int visitorsToday = 0;
  int alerts = 0;

  @override
  void initState() {
    super.initState();
    _fetchDashboardStats();
  }

  Future<void> _fetchDashboardStats() async {
    setState(() => _loadingStats = true);

    try {
      final res = await HttpService.get("/api/stats/summary");

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);

        setState(() {
          totalGrievances = (data["grievances"]?["total"] ?? 0) as int;
          visitorsToday = (data["visitorsToday"] ?? 0) as int;
          alerts = (data["alerts"] ?? 0) as int;
          _loadingStats = false;
        });
      } else if (res.statusCode == 401) {
        await _logout(force: true);
      } else if (res.statusCode == 403) {
        // ✅ stats is Admin only, show 0 for others
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
    return Scaffold(
      backgroundColor: bgLight,
      drawer: _buildDrawer(context),

      // ================= APP BAR =================
      appBar: AppBar(
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
        actions: const [
          Icon(Icons.search, color: Colors.white),
          SizedBox(width: 12),
          Icon(Icons.notifications_none, color: Colors.white),
          SizedBox(width: 12),
        ],
      ),

      // ================= BODY =================
      body: RefreshIndicator(
        onRefresh: _fetchDashboardStats,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _loadingStats ? _statsLoadingRow() : _statsRow(),
              const SizedBox(height: 24),

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
          ),
        ),
      ),

      bottomNavigationBar: _buildBottomBar(context),
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
          _bottomButton(Icons.receipt_long, "Public\nGrievance", () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => GrievanceListPage(role: widget.role),
              ),
            );
          }),

          _bottomButton(Icons.people_alt, "Visitors", () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => VisitorListPage(role: widget.role),
              ),
            );
          }),

          _bottomButton(Icons.cake, "Birthdays", () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BirthdayPage(role: widget.role),
              ),
            );
          }),

          _bottomButton(Icons.train, "Train\nRequests", () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => TrainRequestListPage(role: widget.role),
              ),
            );
          }),

          _bottomButton(Icons.event, "Tour\nPrograms", () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => TourProgramListPage(role: widget.role),
              ),
            );
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

            _drawerItem(Icons.receipt_long, "Public Grievance", onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => GrievanceListPage(role: widget.role),
                ),
              );
            }),

            _drawerItem(Icons.people_alt, "Visitors", onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => VisitorListPage(role: widget.role),
                ),
              );
            }),

            _drawerItem(Icons.cake, "Birthdays", onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => BirthdayPage(role: widget.role),
                ),
              );
            }),

            _drawerItem(Icons.train, "Train Requests", onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TrainRequestListPage(role: widget.role),
                ),
              );
            }),

            _drawerItem(Icons.event, "Tour Programs", onTap: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TourProgramListPage(role: widget.role),
                ),
              );
            }),

            _drawerItem(Icons.newspaper, "News & Intelligence"),
            _drawerItem(Icons.photo_camera, "Photo Booth"),

            const Spacer(),
            const Divider(color: Colors.white30),

            _drawerItem(
              Icons.logout,
              "Logout",
              onTap: () async => _logout(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem(
    IconData icon,
    String title, {
    VoidCallback? onTap,
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
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
