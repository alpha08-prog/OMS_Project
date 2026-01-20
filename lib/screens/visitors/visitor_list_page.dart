import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';

class VisitorListPage extends StatefulWidget {
  final String role;
  const VisitorListPage({super.key, required this.role});

  @override
  State<VisitorListPage> createState() => _VisitorListPageState();
}

class _VisitorListPageState extends State<VisitorListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  bool loading = true;
  String? error;

  List<Map<String, dynamic>> visitors = [];

  @override
  void initState() {
    super.initState();
    fetchVisitors();
  }

  Future<void> fetchVisitors() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final res = await HttpService.get("/api/visitors");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          visitors = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
      } else {
        setState(() {
          error = "Failed to load visitors (${res.statusCode})";
          loading = false;
        });
      }
    } catch (_) {
      setState(() {
        error = "Server error / No internet";
        loading = false;
      });
    }
  }

  void _openAddVisitor() {
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
      builder: (_) => _AddVisitorSheet(
        onCreated: () async {
          Navigator.pop(context);
          await fetchVisitors();
        },
      ),
    );
  }

  Future<void> _deleteVisitor(int id) async {
    final canDelete = widget.role == Roles.admin; // only admin delete
    if (!canDelete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can delete.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete Visitor"),
        content: const Text("Are you sure you want to delete this visitor?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Cancel")),
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
      final res = await HttpService.delete("/api/visitors/$id");
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Deleted ✅")),
        );
        fetchVisitors();
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
        title: const Text("Visitors"),
        backgroundColor: primaryBlue,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: fetchVisitors,
          )
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: primaryBlue,
              onPressed: _openAddVisitor,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : visitors.isEmpty
                  ? const Center(child: Text("No visitors found"))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: visitors.length,
                      itemBuilder: (context, index) {
                        final v = visitors[index];

                        final int? id = v["id"] is int
                            ? v["id"]
                            : int.tryParse(v["id"]?.toString() ?? "");

                        final name = v["name"] ?? v["visitorName"] ?? "Unknown";
                        final phone = v["phone"] ?? v["mobile"] ?? "-";
                        final purpose = v["purpose"] ?? v["note"] ?? "-";
                        final date = v["date"] ?? v["visitDate"] ?? "-";

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
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: primaryBlue.withOpacity(0.1),
                                child: const Icon(Icons.person, color: primaryBlue),
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
                                    const SizedBox(height: 4),
                                    Text(
                                      "Purpose: $purpose",
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),

                              // ✅ Delete only for Admin
                              if (widget.role == Roles.admin && id != null)
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  onPressed: () => _deleteVisitor(id),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}

// ================= ADD VISITOR SHEET =================

class _AddVisitorSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _AddVisitorSheet({required this.onCreated});

  @override
  State<_AddVisitorSheet> createState() => __AddVisitorSheetState();
}

class __AddVisitorSheetState extends State<_AddVisitorSheet> {
  final _formKey = GlobalKey<FormState>();

  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final purposeController = TextEditingController();

  bool submitting = false;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    purposeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/visitors", {
        "name": nameController.text.trim(),
        "phone": phoneController.text.trim(),
        "purpose": purposeController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Visitor added ✅")),
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
              "Add Visitor",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: "Visitor Name",
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
              controller: purposeController,
              decoration: const InputDecoration(
                labelText: "Purpose",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? "Enter purpose" : null,
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
