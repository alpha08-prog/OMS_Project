import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import '../../theme/app_theme.dart';
import '../../widgets/cupertino/cupertino_toast.dart';
import '../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoBirthdayPage extends StatefulWidget {
  final String role;
  const CupertinoBirthdayPage({super.key, required this.role});

  @override
  State<CupertinoBirthdayPage> createState() =>
      _CupertinoBirthdayPageState();
}

class _CupertinoBirthdayPageState extends State<CupertinoBirthdayPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color successGreen = Color(0xFF10B981);
  static const Color warningOrange = Color(0xFFF59E0B);

  int _selectedSegment = 0; // 0 = Today, 1 = Upcoming

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
    _loadAll();
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
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          todayList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
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
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          upcomingList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
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
      CupertinoToast.show(context,
          "Only staff can add birthdays. You can wish only.",
          isError: true);
      return;
    }

    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoAddBirthdaySheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  Future<void> _launchWhatsApp(Map<String, dynamic> item) async {
    final phone =
        (item["phone"] ?? "").toString().replaceAll(RegExp(r'\D'), '');
    final name = item["name"] ?? "Friend";
    final age = item["age"] ?? "";

    if (phone.isEmpty || phone.length < 10) {
      CupertinoToast.show(context, "No valid phone number",
          isError: true);
      return;
    }

    final ordinal = _getOrdinal(
        age is int ? age : int.tryParse(age.toString()) ?? 0);
    final message = '''Happy Birthday, $name!\n\nWishing you a wonderful $ordinal birthday filled with joy, happiness, and all the blessings life has to offer.\n\nMay this special day bring you closer to your dreams and goals.\n\nWarm wishes!''';

    final encodedMessage = Uri.encodeComponent(message);
    final whatsappUrl = "https://wa.me/91$phone?text=$encodedMessage";

    try {
      final uri = Uri.parse(whatsappUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        CupertinoToast.show(context, "Could not open WhatsApp",
            isError: true);
      }
    } catch (e) {
      CupertinoToast.show(context, "Could not open WhatsApp", isError: true);
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
        CupertinoToast.show(context, "Wish marked as sent");
        await _loadAll();
      } else {
        final decoded = jsonDecode(res.body);
        CupertinoToast.show(
            context, decoded["message"] ?? "Failed to mark",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error", isError: true);
    }
  }

  Future<void> _sendAndMarkWish(Map<String, dynamic> item) async {
    await _launchWhatsApp(item);

    // Show dialog to confirm wish was sent
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Wish Sent?"),
        content: const Text(
            "Did you send the birthday wish via WhatsApp?"),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("No, Cancel"),
          ),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Yes, Sent!"),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _markWishSent(item["id"].toString());
    }
  }

  Future<void> _sendAllWishes() async {
    final pendingList =
        todayList.where((b) => b["wishSent"] != true).toList();

    if (pendingList.isEmpty) {
      CupertinoToast.show(context, "All wishes already sent!");
      return;
    }

    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Send All Wishes"),
        content: Text(
          "This will open WhatsApp for ${pendingList.length} birthday wishes one by one.\n\nAfter sending, you'll be asked to confirm each.\n\nContinue?",
        ),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Send All"),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => sendingAll = true);

    for (var item in pendingList) {
      await _sendAndMarkWish(item);
      await Future.delayed(const Duration(milliseconds: 500));
    }

    setState(() => sendingAll = false);
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = widget.role == Roles.staff;
    final isAdmin =
        widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Birthday Wishes",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _loadAll,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white),
                ),
                if (canCreate)
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _openAddBirthdaySheet,
                    child: const Icon(CupertinoIcons.add,
                        color: CupertinoColors.white),
                  ),
              ],
            ),
          ),
          Expanded(child: Column(
          children: [
            // Stats Card
            if (totalBirthdays > 0)
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: wishesSent >= totalBirthdays
                        ? [
                            successGreen,
                            successGreen.withOpacity(0.8)
                          ]
                        : [primaryBlue, primaryBlue.withOpacity(0.8)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: (wishesSent >= totalBirthdays
                              ? successGreen
                              : primaryBlue)
                          .withOpacity(0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment:
                          MainAxisAlignment.spaceAround,
                      children: [
                        _statItem("Total", totalBirthdays,
                            CupertinoIcons.gift),
                        _statItem(
                            "Sent",
                            wishesSent,
                            CupertinoIcons.checkmark_circle,
                            const Color(0xFFB9F6CA)),
                        _statItem(
                            "Pending",
                            wishPending,
                            CupertinoIcons.clock,
                            const Color(0xFFFFCC80)),
                      ],
                    ),
                    if (wishesSent >= totalBirthdays) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color:
                              CupertinoColors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(CupertinoIcons.sparkles,
                                color: CupertinoColors.white,
                                size: 18),
                            SizedBox(width: 8),
                            Text(
                              "All Wishes Sent!",
                              style: TextStyle(
                                color: CupertinoColors.white,
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
                        child: CupertinoButton(
                          color: CupertinoColors.white,
                          padding: const EdgeInsets.symmetric(
                              vertical: 12),
                          borderRadius: BorderRadius.circular(12),
                          onPressed:
                              sendingAll ? null : _sendAllWishes,
                          child: sendingAll
                              ? const CupertinoActivityIndicator()
                              : Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.center,
                                  children: [
                                    Icon(CupertinoIcons.paperplane,
                                        size: 18,
                                        color: successGreen),
                                    const SizedBox(width: 8),
                                    Text(
                                      "Send All Pending Wishes",
                                      style: TextStyle(
                                        color: successGreen,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

            // Segmented control (replaces TabBar)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                width: double.infinity,
                child: CupertinoSlidingSegmentedControl<int>(
                  groupValue: _selectedSegment,
                  thumbColor: primaryBlue,
                  backgroundColor: AppTheme.backgroundAlt,
                  children: {
                    0: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            CupertinoIcons.gift,
                            size: 16,
                            color: _selectedSegment == 0
                                ? CupertinoColors.white
                                : CupertinoColors.label,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            "Today",
                            style: TextStyle(
                              color: _selectedSegment == 0
                                  ? CupertinoColors.white
                                  : CupertinoColors.label,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (wishPending > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: CupertinoColors.activeOrange,
                                borderRadius:
                                    BorderRadius.circular(10),
                              ),
                              child: Text(
                                "$wishPending",
                                style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: CupertinoColors.white),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    1: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            CupertinoIcons.calendar,
                            size: 16,
                            color: _selectedSegment == 1
                                ? CupertinoColors.white
                                : CupertinoColors.label,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            "Upcoming",
                            style: TextStyle(
                              color: _selectedSegment == 1
                                  ? CupertinoColors.white
                                  : CupertinoColors.label,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  },
                  onValueChanged: (value) {
                    if (value != null) {
                      setState(() => _selectedSegment = value);
                    }
                  },
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Tab content
            Expanded(
              child: _selectedSegment == 0
                  ? _todayListView()
                  : _upcomingListView(),
            ),
          ],
        )),
        ],
      ),
    );
  }

  Widget _statItem(String label, int count, IconData icon,
      [Color? iconColor]) {
    return Column(
      children: [
        Icon(icon,
            color: iconColor ??
                CupertinoColors.white.withOpacity(0.7),
            size: 24),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(
            color: CupertinoColors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: CupertinoColors.white.withOpacity(0.7),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _todayListView() {
    if (loadingToday) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (todayList.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.gift,
                size: 64, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 16),
            Text(
              "No birthdays today",
              style: TextStyle(
                  fontSize: 16,
                  color: CupertinoColors.systemGrey),
            ),
          ],
        ),
      );
    }

    final isAdmin =
        widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return CustomScrollView(
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: _loadAll),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final item = todayList[index];
                return _buildBirthdayCard(item, isAdmin, true);
              },
              childCount: todayList.length,
            ),
          ),
        ),
      ],
    );
  }

  Widget _upcomingListView() {
    if (loadingUpcoming) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (upcomingList.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.calendar,
                size: 64, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 16),
            Text(
              "No upcoming birthdays",
              style: TextStyle(
                  fontSize: 16,
                  color: CupertinoColors.systemGrey),
            ),
          ],
        ),
      );
    }

    return CustomScrollView(
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: _loadAll),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final item = upcomingList[index];
                return _buildUpcomingCard(item);
              },
              childCount: upcomingList.length,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBirthdayCard(
      Map<String, dynamic> item, bool isAdmin, bool isToday) {
    final name = item["name"] ?? "Unknown";
    final phone = item["phone"] ?? "-";
    final age = item["age"] ?? "-";
    final relation = item["relation"] ?? "";
    final designation = item["designation"] ?? "";
    final wishSent = item["wishSent"] == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(16),
        border:
            wishSent ? Border.all(color: successGreen, width: 2) : null,
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withOpacity(0.05),
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
                          ? [
                              successGreen,
                              successGreen.withOpacity(0.7)
                            ]
                          : [
                              const Color(0xFFF472B6),
                              const Color(0xFFA78BFA)
                            ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        wishSent
                            ? CupertinoIcons.checkmark
                            : CupertinoIcons.gift,
                        color: CupertinoColors.white,
                        size: 24,
                      ),
                      if (!wishSent)
                        Text(
                          age.toString(),
                          style: const TextStyle(
                            color: CupertinoColors.white,
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
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color:
                                    successGreen.withOpacity(0.1),
                                borderRadius:
                                    BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                      CupertinoIcons
                                          .checkmark_circle_fill,
                                      color: successGreen,
                                      size: 14),
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
                          Icon(CupertinoIcons.phone,
                              size: 14,
                              color: CupertinoColors.systemGrey),
                          const SizedBox(width: 4),
                          Text(
                            phone.toString(),
                            style: TextStyle(
                                fontSize: 13,
                                color:
                                    CupertinoColors.systemGrey),
                          ),
                          if (age != "-") ...[
                            const SizedBox(width: 12),
                            Icon(CupertinoIcons.sparkles,
                                size: 14,
                                color:
                                    CupertinoColors.systemGrey),
                            const SizedBox(width: 4),
                            Text(
                              "Turning $age",
                              style: TextStyle(
                                  fontSize: 13,
                                  color: CupertinoColors
                                      .systemGrey),
                            ),
                          ],
                        ],
                      ),
                      if (relation.toString().isNotEmpty ||
                          designation.toString().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          [relation, designation]
                              .where(
                                  (s) => s.toString().isNotEmpty)
                              .join(" - "),
                          style: TextStyle(
                            fontSize: 12,
                            color: CupertinoColors.systemGrey,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: CupertinoButton(
                      padding: const EdgeInsets.symmetric(
                          vertical: 10),
                      color: CupertinoColors.white,
                      borderRadius: BorderRadius.circular(10),
                      onPressed: () => _launchWhatsApp(item),
                      child: Row(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          Icon(CupertinoIcons.arrow_up_right,
                              size: 16, color: successGreen),
                          const SizedBox(width: 4),
                          Text("Open WhatsApp",
                              style: TextStyle(
                                  color: successGreen,
                                  fontSize: 13)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: CupertinoButton(
                      padding: const EdgeInsets.symmetric(
                          vertical: 10),
                      color: successGreen,
                      borderRadius: BorderRadius.circular(10),
                      onPressed: () => _sendAndMarkWish(item),
                      child: const Row(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          Icon(CupertinoIcons.paperplane,
                              size: 16,
                              color: CupertinoColors.white),
                          SizedBox(width: 4),
                          Text("Send & Mark",
                              style: TextStyle(
                                  color: CupertinoColors.white,
                                  fontSize: 13)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Mark sent manually
          if (isAdmin && !wishSent)
            GestureDetector(
              onTap: () async {
                final confirm = await showCupertinoDialog<bool>(
                  context: context,
                  builder: (ctx) => CupertinoAlertDialog(
                    title: const Text("Mark as Sent?"),
                    content: const Text(
                        "Mark this wish as sent without opening WhatsApp?"),
                    actions: [
                      CupertinoDialogAction(
                        onPressed: () =>
                            Navigator.pop(ctx, false),
                        child: const Text("Cancel"),
                      ),
                      CupertinoDialogAction(
                        isDefaultAction: true,
                        onPressed: () =>
                            Navigator.pop(ctx, true),
                        child: const Text("Mark Sent"),
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
                  color: CupertinoColors.systemGrey6,
                  borderRadius: const BorderRadius.vertical(
                      bottom: Radius.circular(16)),
                ),
                child: Text(
                  "Mark as Sent (Already sent manually)",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.systemGrey,
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
    final daysRaw = item["days_until"];
    final int? daysUntil = daysRaw is int
        ? daysRaw
        : daysRaw is num
            ? daysRaw.toInt()
            : int.tryParse(daysRaw?.toString() ?? '');
    final daysLabel = daysUntil?.toString() ?? "-";
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
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withOpacity(0.05),
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
                  daysLabel,
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
                    Icon(CupertinoIcons.gift,
                        size: 14,
                        color: CupertinoColors.systemGrey),
                    const SizedBox(width: 4),
                    Text(
                      dobFormatted,
                      style: TextStyle(
                          fontSize: 13,
                          color: CupertinoColors.systemGrey),
                    ),
                    const SizedBox(width: 12),
                    Icon(CupertinoIcons.phone,
                        size: 14,
                        color: CupertinoColors.systemGrey),
                    const SizedBox(width: 4),
                    Text(
                      phone.toString(),
                      style: TextStyle(
                          fontSize: 13,
                          color: CupertinoColors.systemGrey),
                    ),
                  ],
                ),
                if (relation.toString().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    relation.toString(),
                    style: TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.systemGrey),
                  ),
                ],
              ],
            ),
          ),
          // Indicator
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: daysUntil == 1
                  ? const Color(0xFFFEF2F2)
                  : (daysUntil != null && daysUntil <= 3)
                      ? const Color(0xFFFFF7ED)
                      : const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              daysUntil == 1
                  ? "Tomorrow!"
                  : daysUntil == 0
                      ? "Today!"
                      : "In $daysLabel days",
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: daysUntil == 1
                    ? const Color(0xFFDC2626)
                    : (daysUntil != null && daysUntil <= 3)
                        ? const Color(0xFFEA580C)
                        : const Color(0xFF2563EB),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ================= ADD BIRTHDAY SHEET =================

class _CupertinoAddBirthdaySheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CupertinoAddBirthdaySheet({required this.onCreated});

  @override
  State<_CupertinoAddBirthdaySheet> createState() =>
      __CupertinoAddBirthdaySheetState();
}

class __CupertinoAddBirthdaySheetState
    extends State<_CupertinoAddBirthdaySheet> {
  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final dobController = TextEditingController();
  final relationController = TextEditingController();
  final designationController = TextEditingController();
  final notesController = TextEditingController();

  DateTime? selectedDate;
  bool submitting = false;

  String? nameError;
  String? phoneError;
  String? dobError;
  String? relationError;

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

  void _pickDate() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: DateTime(1990, 1, 1),
      minimumDate: DateTime(1900),
      maximumDate: DateTime.now(),
      onDateSelected: (date) {
        setState(() {
          selectedDate = date;
          dobController.text = DateFormat('dd MMM yyyy').format(date);
        });
      },
    );
  }

  bool _validate() {
    bool valid = true;
    nameError = null;
    phoneError = null;
    dobError = null;
    relationError = null;

    if (nameController.text.trim().length < 2) {
      nameError = "Enter valid name";
      valid = false;
    }
    if (phoneController.text.trim().length < 10) {
      phoneError = "Enter valid phone";
      valid = false;
    }
    if (dobController.text.trim().isEmpty) {
      dobError = "Select date of birth";
      valid = false;
    }
    if (relationController.text.trim().isEmpty) {
      relationError = "Enter relation";
      valid = false;
    }
    setState(() {});
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;

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
        CupertinoToast.show(context, "Birthday added");
        await widget.onCreated();
      } else {
        CupertinoToast.show(
            context, "Failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.only(
          left: 16, right: 16, bottom: bottom + 16, top: 16),
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey4,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              "Add Birthday",
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),

            _buildField(nameController, "Name *",
                CupertinoIcons.person, nameError),
            const SizedBox(height: 12),

            _buildField(phoneController, "Phone *",
                CupertinoIcons.phone, phoneError,
                keyboardType: TextInputType.phone),
            const SizedBox(height: 12),

            GestureDetector(
              onTap: _pickDate,
              child: AbsorbPointer(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CupertinoTextField(
                      controller: dobController,
                      placeholder: "Date of Birth *",
                      readOnly: true,
                      prefix: Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: Icon(CupertinoIcons.calendar,
                            color: AppTheme.muted, size: 20),
                      ),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: AppTheme.backgroundAlt,
                        border: Border.all(color: AppTheme.border),
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    if (dobError != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(dobError!,
                            style: const TextStyle(
                                color: CupertinoColors
                                    .destructiveRed,
                                fontSize: 12)),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            _buildField(relationController, "Relation/Category *",
                CupertinoIcons.person_2, relationError),
            const SizedBox(height: 12),

            _buildField(designationController,
                "Designation (optional)", CupertinoIcons.briefcase, null),
            const SizedBox(height: 12),

            CupertinoTextField(
              controller: notesController,
              placeholder: "Notes (optional)",
              maxLines: 2,
              prefix: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Icon(CupertinoIcons.doc_text,
                    color: AppTheme.muted, size: 20),
              ),
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: AppTheme.backgroundAlt,
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : Row(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          Icon(
                              submitting
                                  ? CupertinoIcons.clock
                                  : CupertinoIcons
                                      .floppy_disk,
                              size: 20),
                          const SizedBox(width: 8),
                          Text(submitting
                              ? "Saving..."
                              : "Save Birthday"),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildField(TextEditingController controller,
      String placeholder, IconData icon, String? error,
      {TextInputType? keyboardType}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          keyboardType: keyboardType,
          prefix: Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Icon(icon, color: AppTheme.muted, size: 20),
          ),
          padding: const EdgeInsets.symmetric(
              horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: AppTheme.backgroundAlt,
            border: Border.all(color: AppTheme.border),
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(error,
                style: const TextStyle(
                    color: CupertinoColors.destructiveRed,
                    fontSize: 12)),
          ),
      ],
    );
  }
}
