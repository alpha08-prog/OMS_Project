import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import 'grievance_view_page.dart';

class GrievanceListPage extends StatefulWidget {
  final String role;
  const GrievanceListPage({super.key, required this.role});

  @override
  State<GrievanceListPage> createState() => _GrievanceListPageState();
}

class _GrievanceListPageState extends State<GrievanceListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  String selectedStatus = "Open";

  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _allGrievances = [];

  @override
  void initState() {
    super.initState();
    _fetchGrievances();
  }

  // ✅ Map UI filter -> backend status
  String _toBackendStatus(String uiStatus) {
    switch (uiStatus) {
      case "Open":
        return "OPEN";
      case "In Progress":
        return "IN_PROGRESS";
      case "Closed":
        return "RESOLVED";
      default:
        return "OPEN";
    }
  }

  // ✅ Map backend status -> UI status
  String _toUiStatus(String backendStatus) {
    switch (backendStatus.toUpperCase()) {
      case "OPEN":
        return "Open";
      case "IN_PROGRESS":
        return "In Progress";
      case "CLOSED":
      case "RESOLVED":
        return "Closed";
      default:
        return "Open";
    }
  }

  Future<void> _fetchGrievances() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // If your backend supports query:
      // /api/grievances?status=OPEN
      final status = _toBackendStatus(selectedStatus);
      final res = await HttpService.get("/api/grievances?status=$status");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);

        // backend can return array or object with "data"
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        final items = list.map<Map<String, dynamic>>((e) {
          final m = Map<String, dynamic>.from(e);
          m["status"] = _toUiStatus(m["status"] ?? "OPEN");
          return m;
        }).toList();

        setState(() {
          _allGrievances = items;
          _loading = false;
        });
      } else {
        setState(() {
          _error = "Failed to load grievances (${res.statusCode})";
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = "Server error / No internet";
        _loading = false;
      });
    }
  }

  void _openCreate() {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    // TODO: Navigate to create grievance page
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Create grievance page coming next ✅")),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    return Scaffold(
      backgroundColor: bgLight,

      // ✅ Add button only for STAFF/ADMIN
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: primaryBlue,
              onPressed: _openCreate,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,

      // ================= APP BAR =================
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.black87),
        title: const Text(
          "Public Grievances",
          style: TextStyle(
            color: Colors.black87,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.black87),
            onPressed: _fetchGrievances,
          ),
        ],
      ),

      body: Column(
        children: [
          // ================= STATUS FILTER =================
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(30),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                _filterChip("Open"),
                _filterChip("In Progress"),
                _filterChip("Closed"),
              ],
            ),
          ),

          // ================= LIST =================
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text(
                            _error!,
                            style: const TextStyle(fontSize: 15),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : _allGrievances.isEmpty
                        ? const Center(
                            child: Text(
                              "No grievances found",
                              style: TextStyle(fontSize: 15),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                            itemCount: _allGrievances.length,
                            itemBuilder: (context, index) {
                              final grievance = _allGrievances[index];

                              return InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => GrievanceViewPage(
                                        grievanceData: grievance,
                                        role: widget.role, // ✅ pass role
                                      ),
                                    ),
                                  );
                                },
                                child: Container(
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
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      // 📄 ICON
                                      CircleAvatar(
                                        radius: 22,
                                        backgroundColor: primaryBlue.withOpacity(0.1),
                                        child: const Icon(
                                          Icons.assignment,
                                          color: primaryBlue,
                                        ),
                                      ),
                                      const SizedBox(width: 14),

                                      // 📋 INFO
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              grievance["grievanceType"] ??
                                                  grievance["type"] ??
                                                  "-",
                                              style: const TextStyle(
                                                fontSize: 15,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                            const SizedBox(height: 6),
                                            Text(
                                              grievance["constituency"] ??
                                                  grievance["location"] ??
                                                  "-",
                                              style: const TextStyle(
                                                fontSize: 13,
                                                color: Colors.grey,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),

                                      // 🟢 STATUS
                                      _statusChip(grievance["status"] ?? "-"),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  // ================= FILTER CHIP =================
  Widget _filterChip(String status) {
    final bool isSelected = selectedStatus == status;

    return Expanded(
      child: GestureDetector(
        onTap: () async {
          setState(() {
            selectedStatus = status;
          });
          await _fetchGrievances();
        },
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? primaryBlue : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            status,
            style: TextStyle(
              color: isSelected ? Colors.white : Colors.black87,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }

  // ================= STATUS CHIP =================
  Widget _statusChip(String status) {
    Color bg;
    Color text;

    switch (status) {
      case "Open":
        bg = Colors.green.shade50;
        text = Colors.green;
        break;
      case "In Progress":
        bg = Colors.orange.shade50;
        text = Colors.orange;
        break;
      case "Closed":
        bg = Colors.grey.shade300;
        text = Colors.grey.shade800;
        break;
      default:
        bg = Colors.grey.shade200;
        text = Colors.grey;
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
