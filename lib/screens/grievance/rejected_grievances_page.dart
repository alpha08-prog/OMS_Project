import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import 'grievance_view_page.dart';

class RejectedGrievancesPage extends StatefulWidget {
  final String role;

  const RejectedGrievancesPage({super.key, required this.role});

  @override
  State<RejectedGrievancesPage> createState() => _RejectedGrievancesPageState();
}

class _RejectedGrievancesPageState extends State<RejectedGrievancesPage> {
  static const Color _bg = Color(0xFFFEF2F2);
  static const Color _border = Color(0xFFFECACA);
  static const Color _accent = Color(0xFFDC2626);
  static const Color _pillBg = Color(0xFFFEE2E2);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res =
          await HttpService.get("/api/grievances?status=REJECTED&limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final list = decoded is List ? decoded : (decoded["data"] ?? []);
        _items = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      } else {
        _error = "Failed to load (${res.statusCode})";
      }
    } catch (e) {
      _error = "Network error";
    }
    if (mounted) setState(() => _loading = false);
  }

  String _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return "-";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return "-";
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        // Override the global appBarTheme.titleTextStyle (which is white) so
        // the title is readable on this page's white AppBar background.
        titleTextStyle: const TextStyle(
          color: Color(0xFF0F172A),
          fontWeight: FontWeight.bold,
          fontSize: 17,
        ),
        elevation: 0.5,
        title: Row(
          children: [
            const Icon(Icons.cancel_outlined, color: _accent, size: 22),
            const SizedBox(width: 8),
            const Text(
              "Rejected Grievances",
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontWeight: FontWeight.bold,
                fontSize: 17,
              ),
            ),
            if (!_loading) ...[
              const SizedBox(width: 8),
              Text(
                "(${_items.length})",
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontWeight: FontWeight.w500,
                  fontSize: 15,
                ),
              ),
            ],
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetch,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _buildError()
                : _items.isEmpty
                    ? _buildEmpty()
                    : _buildList(),
      ),
    );
  }

  Widget _buildError() {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: Color(0xFF94A3B8)),
              const SizedBox(height: 12),
              Text(_error ?? "Error",
                  style: const TextStyle(color: Color(0xFF64748B))),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _fetch,
                child: const Text("Retry"),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmpty() {
    return ListView(
      children: const [
        Padding(
          padding: EdgeInsets.all(40),
          child: Column(
            children: [
              Icon(Icons.check_circle_outline,
                  size: 48, color: Color(0xFF94A3B8)),
              SizedBox(height: 12),
              Text(
                "No rejected grievances",
                style: TextStyle(color: Color(0xFF64748B), fontSize: 14),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildList() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _bg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _border),
          ),
          child: Column(
            children: [
              ..._items.map((g) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _itemCard(g),
                  )),
              const Padding(
                padding: EdgeInsets.only(top: 4, bottom: 2),
                child: Row(
                  children: [
                    Text("Check the bell ",
                        style: TextStyle(
                            fontSize: 12, color: Color(0xFF64748B))),
                    Text("🔔", style: TextStyle(fontSize: 12)),
                    Text(" in the top bar for the rejection reason.",
                        style: TextStyle(
                            fontSize: 12, color: Color(0xFF64748B))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _itemCard(Map<String, dynamic> g) {
    final petitioner = (g["petitionerName"] ?? "-").toString();
    final type = (g["grievanceType"] ?? "-").toString().replaceAll("_", " ");
    final dateStr = _fmtDate(g["createdAt"]?.toString());

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => GrievanceViewPage(
                grievanceData: g,
                role: widget.role,
              ),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                              fontSize: 14,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          const TextSpan(
                            text: "  —  ",
                            style: TextStyle(
                              fontSize: 14,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                          TextSpan(
                            text: type.toUpperCase(),
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: _accent,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Submitted $dateStr",
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _pillBg,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  "REJECTED",
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.6,
                    color: _accent,
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
