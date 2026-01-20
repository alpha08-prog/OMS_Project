import 'dart:convert';
import 'package:flutter/material.dart';

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

  late TabController _tabController;

  bool loadingToday = true;
  bool loadingUpcoming = true;

  List<Map<String, dynamic>> todayList = [];
  List<Map<String, dynamic>> upcomingList = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([_fetchToday(), _fetchUpcoming()]);
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

  void _openAddBirthdaySheet() {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _AddBirthdaySheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Visitors & Birthdays"),
        backgroundColor: primaryBlue,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: "Today"),
            Tab(text: "Upcoming"),
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

      body: TabBarView(
        controller: _tabController,
        children: [
          _listView(loadingToday, todayList, emptyText: "No birthdays today"),
          _listView(loadingUpcoming, upcomingList,
              emptyText: "No upcoming birthdays"),
        ],
      ),
    );
  }

  Widget _listView(
    bool loading,
    List<Map<String, dynamic>> list, {
    required String emptyText,
  }) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (list.isEmpty) {
      return Center(
        child: Text(
          emptyText,
          style: const TextStyle(fontSize: 15),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final item = list[index];

        final name = item["name"] ?? item["visitorName"] ?? "Unknown";
        final phone = item["phone"] ?? item["mobile"] ?? "-";
        final date = item["dob"] ?? item["date"] ?? "-";
        final note = item["note"] ?? item["purpose"] ?? "";

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
              )
            ],
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: primaryBlue.withOpacity(0.1),
                child: const Icon(Icons.cake, color: primaryBlue),
              ),
              const SizedBox(width: 14),
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
                    const SizedBox(height: 6),
                    Text(
                      "Phone: $phone",
                      style: const TextStyle(
                        fontSize: 13,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Date: $date",
                      style: const TextStyle(
                        fontSize: 13,
                        color: Colors.grey,
                      ),
                    ),
                    if (note.toString().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        note.toString(),
                        style: const TextStyle(fontSize: 13),
                      ),
                    ]
                  ],
                ),
              ),
            ],
          ),
        );
      },
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
  final dateController = TextEditingController();
  final noteController = TextEditingController();

  bool submitting = false;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    dateController.dispose();
    noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/birthdays", {
        "name": nameController.text.trim(),
        "phone": phoneController.text.trim(),
        "dob": dateController.text.trim(), // yyyy-mm-dd
        "note": noteController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Birthday added ✅")),
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
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Add Birthday",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: "Name",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? "Enter valid name" : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: phoneController,
              decoration: const InputDecoration(
                labelText: "Phone",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().length < 10)
                  ? "Enter valid phone"
                  : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: dateController,
              decoration: const InputDecoration(
                labelText: "Date of Birth (YYYY-MM-DD)",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().length != 10)
                  ? "Format: YYYY-MM-DD"
                  : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: noteController,
              decoration: const InputDecoration(
                labelText: "Note (optional)",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A2E5C),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Save"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
