import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/http_service.dart';
import '../utils/access_control.dart';

class BirthdayPage extends StatefulWidget {
  final String role;
  const BirthdayPage({super.key, required this.role});

  @override
  State<BirthdayPage> createState() => _BirthdayPageState();
}

class _BirthdayPageState extends State<BirthdayPage>
    with SingleTickerProviderStateMixin {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color successGreen = Color(0xFF10B981);
  static const Color warningOrange = Color(0xFFF59E0B);

  late TabController _tabController;

  bool loadingToday = true;
  bool loadingUpcoming = true;
  bool sendingAll = false;

  List<Map<String, dynamic>> todayList = [];
  List<Map<String, dynamic>> upcomingList = [];

  // Wish status for today
  int totalBirthdays = 0;
  int wishesSent = 0;
  int wishPending = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadAll();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    await Future.wait([_fetchToday(), _fetchUpcoming(), _fetchWishStatus()]);
  }

  Future<void> _fetchToday() async {
    setState(() => loadingToday = true);

    try {
      final res = await HttpService.get("/api/birthdays/today");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          todayList = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          loadingToday = false;
        });
      } else {
        setState(() => loadingToday = false);
      }
    } catch (_) {
      setState(() => loadingToday = false);
    }
  }

  Future<void> _fetchUpcoming() async {
    setState(() => loadingUpcoming = true);

    try {
      final res = await HttpService.get("/api/birthdays/upcoming");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          upcomingList = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          loadingUpcoming = false;
        });
      } else {
        setState(() => loadingUpcoming = false);
      }
    } catch (_) {
      setState(() => loadingUpcoming = false);
    }
  }

  Future<void> _fetchWishStatus() async {
    try {
      final res = await HttpService.get("/api/birthdays/today/status");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;

        setState(() {
          totalBirthdays = data["totalBirthdays"] ?? 0;
          wishesSent = data["wishesSent"] ?? 0;
          wishPending = data["wishPending"] ?? 0;
        });
      }
    } catch (_) {}
  }

  void _openAddBirthdaySheet() {
    final canCreate = widget.role == Roles.staff;

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only staff can add birthdays. You can wish only.")),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddBirthdaySheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  Future<void> _launchWhatsApp(Map<String, dynamic> item) async {
    final phone = (item["phone"] ?? "").toString().replaceAll(RegExp(r'\D'), '');
    final name = item["name"] ?? "Friend";
    final age = item["age"] ?? "";

    if (phone.isEmpty || phone.length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No valid phone number")),
      );
      return;
    }

    final ordinal = _getOrdinal(age is int ? age : int.tryParse(age.toString()) ?? 0);
    final message = '''🎂 Happy Birthday, $name! 🎉

Wishing you a wonderful $ordinal birthday filled with joy, happiness, and all the blessings life has to offer.

May this special day bring you closer to your dreams and goals.

Warm wishes! 🌟''';

    final encodedMessage = Uri.encodeComponent(message);
    final whatsappUrl = "https://wa.me/91$phone?text=$encodedMessage";

    try {
      final uri = Uri.parse(whatsappUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Could not open WhatsApp")),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Error: $e")),
      );
    }
  }

  String _getOrdinal(int n) {
    if (n <= 0) return "$n";
    final suffixes = ['th', 'st', 'nd', 'rd'];
    final v = n % 100;
    return "$n${suffixes[(v - 20) % 10 > 0 && (v - 20) % 10 < 4 ? (v - 20) % 10 : v < 4 ? v : 0]}";
  }

  Future<void> _markWishSent(String id) async {
    try {
      final res = await HttpService.post("/api/birthdays/$id/wish-sent", {
        "sentVia": "WHATSAPP",
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Wish marked as sent")),
        );
        await _loadAll();
      } else {
        final decoded = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(decoded["message"] ?? "Failed to mark")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    }
  }

  Future<void> _sendAndMarkWish(Map<String, dynamic> item) async {
    await _launchWhatsApp(item);

    // Show dialog to confirm wish was sent
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle_outline, color: Colors.green),
            SizedBox(width: 8),
            Text("Wish Sent?"),
          ],
        ),
        content: const Text("Did you send the birthday wish via WhatsApp?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("No, Cancel"),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.check, size: 18),
            style: ElevatedButton.styleFrom(backgroundColor: successGreen),
            label: const Text("Yes, Sent!", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _markWishSent(item["id"].toString());
    }
  }

  Future<void> _sendAllWishes() async {
    final pendingList = todayList.where((b) => b["wishSent"] != true).toList();

    if (pendingList.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("All wishes already sent!")),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.send, color: Colors.green),
            SizedBox(width: 8),
            Text("Send All Wishes"),
          ],
        ),
        content: Text(
          "This will open WhatsApp for ${pendingList.length} birthday wishes one by one.\n\nAfter sending, you'll be asked to confirm each.\n\nContinue?",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.send, size: 18),
            style: ElevatedButton.styleFrom(backgroundColor: successGreen),
            label: const Text("Send All", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => sendingAll = true);

    for (var item in pendingList) {
      await _sendAndMarkWish(item);
      // Small delay between each
      await Future.delayed(const Duration(milliseconds: 500));
    }

    setState(() => sendingAll = false);
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = widget.role == Roles.staff;
    final isAdmin = widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        elevation: 0,
        title: const Text("Birthday Wishes", style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: primaryBlue,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          labelStyle: const TextStyle(fontWeight: FontWeight.w600),
          tabs: [
            Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cake, size: 18),
                  const SizedBox(width: 6),
                  const Text("Today"),
                  if (wishPending > 0) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        "$wishPending",
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.calendar_today, size: 18),
                  SizedBox(width: 6),
                  Text("Upcoming"),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAll,
          ),
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: primaryBlue,
              onPressed: _openAddBirthdaySheet,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: Column(
        children: [
          // Stats Card
          if (totalBirthdays > 0)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: wishesSent >= totalBirthdays
                      ? [successGreen, successGreen.withOpacity(0.8)]
                      : [primaryBlue, primaryBlue.withOpacity(0.8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: (wishesSent >= totalBirthdays ? successGreen : primaryBlue).withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _statItem("Total", totalBirthdays, Icons.cake),
                      _statItem("Sent", wishesSent, Icons.check_circle, Colors.lightGreenAccent),
                      _statItem("Pending", wishPending, Icons.pending, Colors.orangeAccent),
                    ],
                  ),
                  if (wishesSent >= totalBirthdays) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.celebration, color: Colors.white, size: 18),
                          SizedBox(width: 8),
                          Text(
                            "All Wishes Sent!",
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  // Send All button for admin
                  if (isAdmin && wishPending > 0) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: sendingAll ? null : _sendAllWishes,
                        icon: sendingAll
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.green),
                              )
                            : const Icon(Icons.send, size: 18),
                        label: Text(sendingAll ? "Sending..." : "Send All Pending Wishes"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: successGreen,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

          // Tab content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _todayListView(),
                _upcomingListView(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statItem(String label, int count, IconData icon, [Color? iconColor]) {
    return Column(
      children: [
        Icon(icon, color: iconColor ?? Colors.white70, size: 24),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _todayListView() {
    if (loadingToday) {
      return const Center(child: CircularProgressIndicator());
    }

    if (todayList.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cake_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              "No birthdays today",
              style: TextStyle(fontSize: 16, color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    final isAdmin = widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        itemCount: todayList.length,
        itemBuilder: (context, index) {
          final item = todayList[index];
          return _buildBirthdayCard(item, isAdmin, true);
        },
      ),
    );
  }

  Widget _upcomingListView() {
    if (loadingUpcoming) {
      return const Center(child: CircularProgressIndicator());
    }

    if (upcomingList.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              "No upcoming birthdays",
              style: TextStyle(fontSize: 16, color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        itemCount: upcomingList.length,
        itemBuilder: (context, index) {
          final item = upcomingList[index];
          return _buildUpcomingCard(item);
        },
      ),
    );
  }

  Widget _buildBirthdayCard(Map<String, dynamic> item, bool isAdmin, bool isToday) {
    final name = item["name"] ?? "Unknown";
    final phone = item["phone"] ?? "-";
    final age = item["age"] ?? "-";
    final relation = item["relation"] ?? "";
    final designation = item["designation"] ?? "";
    final wishSent = item["wishSent"] == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: wishSent ? Border.all(color: successGreen, width: 2) : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: wishSent
                          ? [successGreen, successGreen.withOpacity(0.7)]
                          : [Colors.pink.shade300, Colors.purple.shade300],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        wishSent ? Icons.check : Icons.cake,
                        color: Colors.white,
                        size: 24,
                      ),
                      if (!wishSent)
                        Text(
                          age.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                // Info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              name.toString(),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          if (wishSent)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: successGreen.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.check_circle, color: successGreen, size: 14),
                                  const SizedBox(width: 4),
                                  Text(
                                    "Sent",
                                    style: TextStyle(
                                      color: successGreen,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.phone, size: 14, color: Colors.grey.shade500),
                          const SizedBox(width: 4),
                          Text(
                            phone.toString(),
                            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                          ),
                          if (age != "-") ...[
                            const SizedBox(width: 12),
                            Icon(Icons.celebration, size: 14, color: Colors.grey.shade500),
                            const SizedBox(width: 4),
                            Text(
                              "Turning $age",
                              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                            ),
                          ],
                        ],
                      ),
                      if (relation.toString().isNotEmpty || designation.toString().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          [relation, designation]
                              .where((s) => s.toString().isNotEmpty)
                              .join(" • "),
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Admin actions
          if (isAdmin && !wishSent)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _launchWhatsApp(item),
                      icon: const Icon(Icons.open_in_new, size: 16),
                      label: const Text("Open WhatsApp"),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: successGreen,
                        side: BorderSide(color: successGreen),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _sendAndMarkWish(item),
                      icon: const Icon(Icons.send, size: 16),
                      label: const Text("Send & Mark"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: successGreen,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Mark sent manually (if admin wants to just mark without sending)
          if (isAdmin && !wishSent)
            InkWell(
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    title: const Text("Mark as Sent?"),
                    content: const Text("Mark this wish as sent without opening WhatsApp?"),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text("Cancel"),
                      ),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        style: ElevatedButton.styleFrom(backgroundColor: primaryBlue),
                        child: const Text("Mark Sent", style: TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  await _markWishSent(item["id"].toString());
                }
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
                ),
                child: Text(
                  "Mark as Sent (Already sent manually)",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildUpcomingCard(Map<String, dynamic> item) {
    final name = item["name"] ?? "Unknown";
    final phone = item["phone"] ?? "-";
    final daysUntil = item["days_until"] ?? "-";
    final relation = item["relation"] ?? "";
    final dob = item["dob"];

    String dobFormatted = "-";
    if (dob != null) {
      try {
        final date = DateTime.parse(dob.toString());
        dobFormatted = DateFormat('dd MMM').format(date);
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // Days countdown
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: primaryBlue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  daysUntil.toString(),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: primaryBlue,
                  ),
                ),
                Text(
                  "days",
                  style: TextStyle(
                    fontSize: 10,
                    color: primaryBlue.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.toString(),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.cake, size: 14, color: Colors.grey.shade500),
                    const SizedBox(width: 4),
                    Text(
                      dobFormatted,
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                    ),
                    const SizedBox(width: 12),
                    Icon(Icons.phone, size: 14, color: Colors.grey.shade500),
                    const SizedBox(width: 4),
                    Text(
                      phone.toString(),
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                    ),
                  ],
                ),
                if (relation.toString().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    relation.toString(),
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  ),
                ],
              ],
            ),
          ),
          // Indicator
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: daysUntil == 1
                  ? Colors.red.shade50
                  : daysUntil <= 3
                      ? Colors.orange.shade50
                      : Colors.blue.shade50,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              daysUntil == 1 ? "Tomorrow!" : "In $daysUntil days",
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: daysUntil == 1
                    ? Colors.red.shade700
                    : daysUntil <= 3
                        ? Colors.orange.shade700
                        : Colors.blue.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ================= ADD BIRTHDAY SHEET =================

class _AddBirthdaySheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _AddBirthdaySheet({required this.onCreated});

  @override
  State<_AddBirthdaySheet> createState() => __AddBirthdaySheetState();
}

class __AddBirthdaySheetState extends State<_AddBirthdaySheet> {
  final _formKey = GlobalKey<FormState>();

  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final dobController = TextEditingController();
  final relationController = TextEditingController();
  final designationController = TextEditingController();
  final notesController = TextEditingController();

  DateTime? selectedDate;
  bool submitting = false;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    dobController.dispose();
    relationController.dispose();
    designationController.dispose();
    notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime(1990, 1, 1),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFF0A2E5C),
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );

    if (date != null) {
      setState(() {
        selectedDate = date;
        dobController.text = DateFormat('dd MMM yyyy').format(date);
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final dobFormatted = selectedDate != null
          ? "${selectedDate!.year}-${selectedDate!.month.toString().padLeft(2, '0')}-${selectedDate!.day.toString().padLeft(2, '0')}"
          : "";

      final res = await HttpService.post("/api/birthdays", {
        "name": nameController.text.trim(),
        "phone": phoneController.text.trim(),
        "dob": dobFormatted,
        "relation": relationController.text.trim(),
        "designation": designationController.text.trim(),
        "notes": notesController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Birthday added")),
        );
        await widget.onCreated();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, bottom: bottom + 16, top: 16),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                "Add Birthday",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),

              TextFormField(
                controller: nameController,
                decoration: InputDecoration(
                  labelText: "Name *",
                  prefixIcon: const Icon(Icons.person),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
                validator: (v) =>
                    (v == null || v.trim().length < 2) ? "Enter valid name" : null,
              ),
              const SizedBox(height: 12),

              TextFormField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: "Phone *",
                  prefixIcon: const Icon(Icons.phone),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
                validator: (v) =>
                    (v == null || v.trim().length < 10) ? "Enter valid phone" : null,
              ),
              const SizedBox(height: 12),

              TextFormField(
                controller: dobController,
                readOnly: true,
                onTap: _pickDate,
                decoration: InputDecoration(
                  labelText: "Date of Birth *",
                  prefixIcon: const Icon(Icons.calendar_today),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? "Select date of birth" : null,
              ),
              const SizedBox(height: 12),

              TextFormField(
                controller: relationController,
                decoration: InputDecoration(
                  labelText: "Relation/Category *",
                  prefixIcon: const Icon(Icons.group),
                  hintText: "e.g., VIP, Party Worker, Supporter",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? "Enter relation" : null,
              ),
              const SizedBox(height: 12),

              TextFormField(
                controller: designationController,
                decoration: InputDecoration(
                  labelText: "Designation (optional)",
                  prefixIcon: const Icon(Icons.work),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
              ),
              const SizedBox(height: 12),

              TextFormField(
                controller: notesController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: "Notes (optional)",
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 24),
                    child: Icon(Icons.notes),
                  ),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: submitting ? null : _submit,
                  icon: submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.save),
                  label: Text(submitting ? "Saving..." : "Save Birthday"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A2E5C),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
