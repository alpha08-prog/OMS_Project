import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

import '../services/http_service.dart';
import '../theme/app_theme.dart';

class GrievanceChart extends StatefulWidget {
  const GrievanceChart({super.key});

  @override
  State<GrievanceChart> createState() => _GrievanceChartState();
}

class _GrievanceChartState extends State<GrievanceChart> {
  bool _loading = true;
  List<Map<String, dynamic>> _statusData = [];
  int _touchedIndex = -1;

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    try {
      final res = await HttpService.get("/api/stats/grievances/by-status");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          _statusData = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'OPEN': return Colors.blue;
      case 'IN_PROGRESS': return Colors.orange;
      case 'VERIFIED': return AppTheme.primaryIndigo;
      case 'RESOLVED': return Colors.green;
      case 'REJECTED': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Container(
        height: 200,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: AppTheme.shadowSm,
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    if (_statusData.isEmpty) return const SizedBox.shrink();

    final total = _statusData.fold<int>(0, (sum, e) => sum + ((e['_count']?['_all'] ?? e['count'] ?? 0) as int));
    if (total == 0) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Grievance Status",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text("Total: $total", style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          const SizedBox(height: 16),
          SizedBox(
            height: 180,
            child: Row(
              children: [
                Expanded(
                  child: PieChart(
                    PieChartData(
                      pieTouchData: PieTouchData(
                        touchCallback: (event, pieTouchResponse) {
                          setState(() {
                            if (!event.isInterestedForInteractions ||
                                pieTouchResponse == null ||
                                pieTouchResponse.touchedSection == null) {
                              _touchedIndex = -1;
                              return;
                            }
                            _touchedIndex = pieTouchResponse.touchedSection!.touchedSectionIndex;
                          });
                        },
                      ),
                      borderData: FlBorderData(show: false),
                      sectionsSpace: 2,
                      centerSpaceRadius: 36,
                      sections: _buildSections(total),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _statusData.map((e) {
                    final status = e['status'] ?? '-';
                    final count = (e['_count']?['_all'] ?? e['count'] ?? 0) as int;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 10, height: 10,
                            decoration: BoxDecoration(
                              color: _statusColor(status),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            "${status.toString().replaceAll('_', ' ')} ($count)",
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<PieChartSectionData> _buildSections(int total) {
    return _statusData.asMap().entries.map((entry) {
      final i = entry.key;
      final e = entry.value;
      final status = e['status'] ?? '-';
      final count = (e['_count']?['_all'] ?? e['count'] ?? 0) as int;
      final isTouched = i == _touchedIndex;
      final percentage = (count / total * 100).toStringAsFixed(1);

      return PieChartSectionData(
        color: _statusColor(status),
        value: count.toDouble(),
        title: isTouched ? '$percentage%' : '',
        radius: isTouched ? 50 : 40,
        titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
      );
    }).toList();
  }
}
