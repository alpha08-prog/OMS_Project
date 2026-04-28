import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class StaffHistoryPage extends StatefulWidget {
  const StaffHistoryPage({super.key});

  @override
  State<StaffHistoryPage> createState() => _StaffHistoryPageState();
}

class _StaffHistoryPageState extends State<StaffHistoryPage> {
  bool _loading = true;
  String _selectedType = 'All';

  List<Map<String, dynamic>> _grievances = [];
  List<Map<String, dynamic>> _trainRequests = [];
  List<Map<String, dynamic>> _tourPrograms = [];
  List<Map<String, dynamic>> _visitors = [];

  @override
  void initState() {
    super.initState();
    _fetchAll();
  }

  Future<void> _fetchAll() async {
    setState(() => _loading = true);
    try {
      await Future.wait([
        _fetchGrievances(),
        _fetchTrainRequests(),
        _fetchTourPrograms(),
        _fetchVisitors(),
      ]);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchGrievances() async {
    final res = await HttpService.get("/api/grievances?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _grievances = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchTrainRequests() async {
    final res = await HttpService.get("/api/train-requests?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _trainRequests = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchTourPrograms() async {
    final res = await HttpService.get("/api/tour-programs?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _tourPrograms = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchVisitors() async {
    final res = await HttpService.get("/api/visitors?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _visitors = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  List<Map<String, dynamic>> get _filteredItems {
    List<Map<String, dynamic>> items = [];

    if (_selectedType == 'All' || _selectedType == 'Grievance') {
      for (var g in _grievances) {
        items.add({
          'type': 'GRIEVANCE',
          'title': g['petitionerName'] ?? '-',
          'subtitle': g['grievanceType']?.toString().replaceAll('_', ' ') ?? '-',
          'status': g['status'] ?? 'OPEN',
          'date': g['createdAt'],
          'icon': Icons.assignment,
          'color': Colors.indigo,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Train') {
      for (var t in _trainRequests) {
        items.add({
          'type': 'TRAIN_REQUEST',
          'title': 'PNR: ${t['pnrNumber'] ?? '-'}',
          'subtitle': '${t['trainName'] ?? ''} | ${t['fromStation'] ?? ''} -> ${t['toStation'] ?? ''}',
          'status': t['status'] ?? 'PENDING',
          'date': t['createdAt'],
          'icon': Icons.train,
          'color': Colors.blue,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Tour') {
      for (var tp in _tourPrograms) {
        items.add({
          'type': 'TOUR_PROGRAM',
          'title': tp['eventName'] ?? '-',
          'subtitle': 'by ${tp['organizer'] ?? '-'}',
          'status': tp['decision'] ?? 'PENDING',
          'date': tp['createdAt'],
          'icon': Icons.event,
          'color': Colors.purple,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Visitor') {
      for (var v in _visitors) {
        items.add({
          'type': 'VISITOR',
          'title': v['name'] ?? '-',
          'subtitle': v['purpose'] ?? '-',
          'status': 'LOGGED',
          'date': v['createdAt'],
          'icon': Icons.people,
          'color': Colors.teal,
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) {
      final aDate = DateTime.tryParse(a['date'] ?? '') ?? DateTime(2000);
      final bDate = DateTime.tryParse(b['date'] ?? '') ?? DateTime(2000);
      return bDate.compareTo(aDate);
    });

    return items;
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'OPEN':
      case 'PENDING': return Colors.orange;
      case 'IN_PROGRESS':
      case 'ASSIGNED': return Colors.blue;
      case 'VERIFIED':
      case 'APPROVED':
      case 'ACCEPTED':
      case 'COMPLETED':
      case 'RESOLVED': return Colors.green;
      case 'REJECTED':
      case 'REGRET': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredItems;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("My Submissions"),
        backgroundColor: AppTheme.primaryIndigo,
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _fetchAll),
        ],
      ),
      body: Column(
        children: [
          // Stats
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: AppTheme.primaryGradient,
              borderRadius: BorderRadius.circular(16),
              boxShadow: AppTheme.shadowMd,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _statCol("Grievances", _grievances.length),
                _statCol("Train", _trainRequests.length),
                _statCol("Tours", _tourPrograms.length),
                _statCol("Visitors", _visitors.length),
              ],
            ),
          ),

          // Filter chips
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: ['All', 'Grievance', 'Train', 'Tour', 'Visitor'].map((type) {
                final selected = _selectedType == type;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(type),
                    selected: selected,
                    onSelected: (_) => setState(() => _selectedType = type),
                    selectedColor: AppTheme.primaryIndigo,
                    labelStyle: TextStyle(
                      color: selected ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.w600, fontSize: 12,
                    ),
                    checkmarkColor: Colors.white,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),

          // List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : items.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.history, size: 64, color: Colors.grey.shade300),
                            const SizedBox(height: 16),
                            Text("No submissions found", style: TextStyle(color: Colors.grey.shade500)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchAll,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: items.length,
                          itemBuilder: (_, i) => _buildItemCard(items[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _statCol(String label, int count) {
    return Column(
      children: [
        Text("$count", style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }

  Widget _buildItemCard(Map<String, dynamic> item) {
    String dateStr = "";
    try {
      dateStr = DateFormat('dd MMM yyyy').format(DateTime.parse(item['date']));
    } catch (_) {}

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: (item['color'] as Color).withOpacity(0.1),
            child: Icon(item['icon'] as IconData, color: item['color'] as Color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['title'], style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                Text(item['subtitle'], style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _statusColor(item['status']).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(item['status'].toString().replaceAll('_', ' '),
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: _statusColor(item['status']))),
                    ),
                    const Spacer(),
                    Text(dateStr, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
