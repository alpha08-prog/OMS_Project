import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';

class TourProgramListPage extends StatefulWidget {
  final String role;
  const TourProgramListPage({super.key, required this.role});

  @override
  State<TourProgramListPage> createState() => _TourProgramListPageState();
}

class _TourProgramListPageState extends State<TourProgramListPage>
    with SingleTickerProviderStateMixin {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  late TabController _tabController;

  bool loadingAll = true;
  bool loadingToday = true;
  bool loadingUpcoming = true;

  List<Map<String, dynamic>> allList = [];
  List<Map<String, dynamic>> todayList = [];
  List<Map<String, dynamic>> upcomingList = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([
      _fetchAll(),
      _fetchToday(),
      _fetchUpcoming(),
    ]);
  }

  Future<void> _fetchAll() async {
    setState(() => loadingAll = true);

    try {
      final res = await HttpService.get("/api/tour-programs");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          allList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loadingAll = false;
        });
      } else {
        setState(() => loadingAll = false);
      }
    } catch (_) {
      setState(() => loadingAll = false);
    }
  }

  Future<void> _fetchToday() async {
    setState(() => loadingToday = true);

    try {
      final res = await HttpService.get("/api/tour-programs/schedule/today");
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
      final res = await HttpService.get("/api/tour-programs/upcoming");
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

  void _openCreateSheet() {
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
      builder: (_) => _CreateTourProgramSheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  int? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id;
    if (id is String) return int.tryParse(id);
    return null;
  }

  Future<void> _updateDecision(int id, String decision) async {
    // Only ADMIN can set decision
    if (widget.role != Roles.admin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can update decision.")),
      );
      return;
    }

    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": decision},
      );

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Decision updated ✅")),
        );
        _loadAll();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _deleteProgram(int id) async {
    if (widget.role != Roles.admin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can delete.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete Tour Program"),
        content: const Text("Are you sure you want to delete this program?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Delete", style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/tour-programs/$id");
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Deleted ✅")),
        );
        _loadAll();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Delete failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Tour Programs"),
        backgroundColor: primaryBlue,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAll,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(text: "All"),
            Tab(text: "Today"),
            Tab(text: "Upcoming"),
          ],
        ),
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: primaryBlue,
              onPressed: _openCreateSheet,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: TabBarView(
        controller: _tabController,
        children: [
          _listView(loadingAll, allList),
          _listView(loadingToday, todayList),
          _listView(loadingUpcoming, upcomingList),
        ],
      ),
    );
  }

  Widget _listView(bool loading, List<Map<String, dynamic>> list) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (list.isEmpty) {
      return const Center(child: Text("No programs found"));
    }

    final isAdmin = widget.role == Roles.admin;

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final item = list[index];

        final id = _getId(item);

        final title = item["title"] ?? item["programName"] ?? "Tour Program";
        final location = item["location"] ?? "-";
        final date = item["date"] ?? item["scheduleDate"] ?? "-";
        final status = (item["decision"] ?? item["status"] ?? "PENDING").toString();

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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: primaryBlue.withOpacity(0.1),
                    child: const Icon(Icons.event, color: primaryBlue),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Location: $location",
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
                      ],
                    ),
                  ),
                  _statusChip(status),
                ],
              ),

              // ✅ ADMIN decision controls
              if (isAdmin && id != null) ...[
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _updateDecision(id, "REJECTED"),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text("Reject"),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _updateDecision(id, "APPROVED"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text("Approve"),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: OutlinedButton.icon(
                    onPressed: () => _deleteProgram(id),
                    icon: const Icon(Icons.delete, color: Colors.red),
                    label: const Text(
                      "Delete Program",
                      style: TextStyle(color: Colors.red),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.red),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                )
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _statusChip(String status) {
    final s = status.toUpperCase();

    Color bg = Colors.grey.shade200;
    Color text = Colors.grey.shade800;

    if (s.contains("PENDING")) {
      bg = Colors.orange.shade50;
      text = Colors.orange;
    } else if (s.contains("APPROVED")) {
      bg = Colors.green.shade50;
      text = Colors.green;
    } else if (s.contains("REJECT")) {
      bg = Colors.red.shade50;
      text = Colors.red;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: text,
        ),
      ),
    );
  }
}

// ================= CREATE TOUR PROGRAM SHEET =================

class _CreateTourProgramSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CreateTourProgramSheet({required this.onCreated});

  @override
  State<_CreateTourProgramSheet> createState() => __CreateTourProgramSheetState();
}

class __CreateTourProgramSheetState extends State<_CreateTourProgramSheet> {
  final _formKey = GlobalKey<FormState>();

  final titleController = TextEditingController();
  final locationController = TextEditingController();
  final dateController = TextEditingController();
  final noteController = TextEditingController();

  bool submitting = false;

  @override
  void dispose() {
    titleController.dispose();
    locationController.dispose();
    dateController.dispose();
    noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/tour-programs", {
        "title": titleController.text.trim(),
        "location": locationController.text.trim(),
        "date": dateController.text.trim(), // YYYY-MM-DD
        "note": noteController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Tour program created ✅")),
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
              "Create Tour Program",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: titleController,
              decoration: const InputDecoration(
                labelText: "Title",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? "Enter valid title" : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: locationController,
              decoration: const InputDecoration(
                labelText: "Location",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? "Enter location" : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: dateController,
              decoration: const InputDecoration(
                labelText: "Date (YYYY-MM-DD)",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length != 10) ? "Format: YYYY-MM-DD" : null,
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
