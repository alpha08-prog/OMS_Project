import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';

class ActionHistoryPage extends StatefulWidget {
  const ActionHistoryPage({super.key});

  @override
  State<ActionHistoryPage> createState() => _ActionHistoryPageState();
}

class _ActionHistoryPageState extends State<ActionHistoryPage> {
  bool _loadingList = true;
  bool _loadingStats = true;
  String? _error;

  List<Map<String, dynamic>> _items = [];
  Map<String, dynamic> _stats = {};

  // Filters
  String _typeFilter = 'All';
  String _actionFilter = 'All';
  DateTime? _fromDate;
  DateTime? _toDate;

  static const List<_Opt> _typeOptions = [
    _Opt('All', 'All Types'),
    _Opt('GRIEVANCE', 'Grievance'),
    _Opt('TEMPLE_VISIT', 'Temple Visit'),
    _Opt('TRAIN_REQUEST', 'Train Request'),
    _Opt('TOUR_PROGRAM', 'Tour Program'),
  ];

  static const List<_Opt> _actionOptions = [
    _Opt('All', 'All Actions'),
    _Opt('VERIFIED', 'Verified'),
    _Opt('RESOLVED', 'Resolved'),
    _Opt('REJECTED', 'Rejected'),
    _Opt('IN_PROGRESS', 'In Progress'),
    _Opt('ACCEPTED', 'Accepted'),
    _Opt('REGRET', 'Regret'),
  ];

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  void _exportCsv() {
    String nameOf(dynamic v) {
      if (v is Map) return (v['name'] ?? '').toString();
      return (v ?? '').toString();
    }

    CsvExport.export(
      context,
      fileName: 'action_history',
      headers: ['Type', 'Title', 'Description', 'Action', 'Action By', 'Date/Time'],
      rows: _items.map((item) {
        return [
          item['type'] ?? '',
          item['title'] ?? '',
          item['description'] ?? '',
          item['action'] ?? '',
          nameOf(item['actionBy']),
          item['createdAt'] ?? item['dateTime'] ?? item['date'] ?? '',
        ];
      }).toList(),
    );
  }

  Future<void> _loadAll() async {
    await Future.wait([_fetchStats(), _fetchHistory()]);
  }

  Future<void> _fetchStats() async {
    if (mounted) setState(() => _loadingStats = true);
    try {
      final res = await HttpService.get('/api/history/stats');
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded is Map && decoded['data'] is Map
            ? Map<String, dynamic>.from(decoded['data'])
            : (decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{});
        if (mounted) setState(() => _stats = data);
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingStats = false);
  }

  Future<void> _fetchHistory() async {
    if (mounted) {
      setState(() {
        _loadingList = true;
        _error = null;
      });
    }
    try {
      final params = <String, String>{'limit': '100'};
      // Backend `type` filter only knows GRIEVANCE / TRAIN_REQUEST /
      // TOUR_PROGRAM. The Temple Visit option is a subset of GRIEVANCE rows,
      // narrowed client-side below using `details.grievanceType`.
      final isTempleFilter = _typeFilter == 'TEMPLE_VISIT';
      if (isTempleFilter) {
        params['type'] = 'GRIEVANCE';
      } else if (_typeFilter != 'All') {
        params['type'] = _typeFilter;
      }
      if (_actionFilter != 'All') params['action'] = _actionFilter;
      if (_fromDate != null) {
        params['startDate'] = _fromDate!.toIso8601String();
      }
      if (_toDate != null) {
        final endOfDay = DateTime(_toDate!.year, _toDate!.month, _toDate!.day, 23, 59, 59);
        params['endDate'] = endOfDay.toIso8601String();
      }
      final qs = params.entries
          .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
          .join('&');
      final res = await HttpService.get('/api/history?$qs');
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List
            ? decoded
            : (decoded is Map && decoded['data'] is List ? decoded['data'] : []);
        if (mounted) {
          var items = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          if (isTempleFilter) {
            items = items.where((it) {
              final details = it['details'];
              if (details is Map) {
                return details['grievanceType'] == 'TEMPLE_VISIT';
              }
              return false;
            }).toList();
          }
          setState(() {
            _items = items;
            _loadingList = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = 'Failed to load (${res.statusCode})';
            _loadingList = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Server error / No internet';
          _loadingList = false;
        });
      }
    }
  }

  Future<void> _pickDate(bool isFrom) async {
    final initial = isFrom ? (_fromDate ?? DateTime.now()) : (_toDate ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppTheme.primaryIndigo,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        if (isFrom) {
          _fromDate = picked;
        } else {
          _toDate = picked;
        }
      });
    }
  }

  void _clearFilters() {
    setState(() {
      _typeFilter = 'All';
      _actionFilter = 'All';
      _fromDate = null;
      _toDate = null;
    });
    _fetchHistory();
  }

  bool get _hasFilters =>
      _typeFilter != 'All' ||
      _actionFilter != 'All' ||
      _fromDate != null ||
      _toDate != null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: RefreshIndicator(
        onRefresh: _loadAll,
        color: AppTheme.primaryIndigo,
        child: CustomScrollView(
          slivers: [
            _buildSliverAppBar(),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  _buildStatsGrid(),
                  const SizedBox(height: 18),
                  _buildFilterPanel(),
                  if (_hasFilters) ...[
                    const SizedBox(height: 10),
                    _buildAppliedFilters(),
                  ],
                  const SizedBox(height: 18),
                  _buildLogHeader(),
                  const SizedBox(height: 10),
                  if (_loadingList)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_error != null)
                    _buildError()
                  else if (_items.isEmpty)
                    _buildEmpty()
                  else
                    ..._items.map(_buildLogCard),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      pinned: true,
      expandedHeight: 150,
      backgroundColor: AppTheme.primaryIndigo,
      iconTheme: const IconThemeData(color: Colors.white),
      title: const Text(
        'Action History',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.download, color: Colors.white),
          tooltip: 'Export CSV',
          onPressed: _items.isEmpty ? null : _exportCsv,
        ),
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          tooltip: 'Refresh',
          onPressed: _loadAll,
        ),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppTheme.primaryIndigoDark,
                AppTheme.primaryIndigo,
                AppTheme.primaryIndigoLight,
              ],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -30,
                top: 20,
                child: Icon(
                  Icons.history,
                  size: 160,
                  color: Colors.white.withValues(alpha: 0.06),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'AUDIT LOG',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.1,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'View all administrative actions',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: 13,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ============ STATS ============

  Widget _buildStatsGrid() {
    final g = (_stats['grievances'] ?? const {}) as Map;
    final t = (_stats['trainRequests'] ?? const {}) as Map;
    final tp = (_stats['tourPrograms'] ?? const {}) as Map;
    final total = _stats['totalActions'] ?? 0;

    return GridView.count(
      // Nested list: never re-apply the screen's safe-area insets.
      padding: EdgeInsets.zero,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.55,
      children: [
        _statCard(
          icon: Icons.assignment_outlined,
          accent: AppTheme.primaryIndigo,
          accentBg: AppTheme.primaryIndigo50,
          title: 'Grievances',
          total: g['total'] ?? 0,
          breakdown: [
            _BD('${g['resolved'] ?? 0} resolved', Colors.green.shade600, Icons.check_circle),
            _BD('${g['rejected'] ?? 0} rejected', Colors.red.shade500, Icons.cancel),
          ],
        ),
        _statCard(
          icon: Icons.train_outlined,
          accent: const Color(0xFF0EA5E9),
          accentBg: const Color(0xFFE0F2FE),
          title: 'Train Requests',
          total: t['total'] ?? 0,
          breakdown: [
            _BD('${t['approved'] ?? 0} accepted', Colors.green.shade600, Icons.check_circle),
            _BD('${t['rejected'] ?? 0} regret', Colors.red.shade500, Icons.cancel),
            _BD('${t['resolved'] ?? 0} resolved', Colors.blueGrey.shade400, Icons.check_circle_outline),
          ],
        ),
        _statCard(
          icon: Icons.event_outlined,
          accent: AppTheme.saffronDark,
          accentBg: AppTheme.saffronSoft,
          title: 'Tour Programs',
          total: tp['total'] ?? 0,
          breakdown: [
            _BD('${tp['accepted'] ?? 0} accepted', Colors.green.shade600, Icons.check_circle),
            _BD('${tp['regret'] ?? 0} regret', AppTheme.saffronDark, Icons.warning_amber_rounded),
          ],
        ),
        _statCardHighlight(total: total),
      ],
    );
  }

  Widget _statCard({
    required IconData icon,
    required Color accent,
    required Color accentBg,
    required String title,
    required dynamic total,
    required List<_BD> breakdown,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey.shade600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _loadingStats ? '–' : '$total',
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.foreground,
                        height: 1.1,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: accentBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: _loadingStats
                    ? const Padding(
                        padding: EdgeInsets.all(7),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(icon, color: accent, size: 16),
              ),
            ],
          ),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: breakdown.map((b) => _miniPill(b)).toList(),
          ),
        ],
      ),
    );
  }

  Widget _miniPill(_BD b) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: b.color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(b.icon, size: 10, color: b.color),
          const SizedBox(width: 3),
          Text(
            b.label,
            style: TextStyle(
              fontSize: 10,
              color: b.color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _statCardHighlight({required dynamic total}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.primaryIndigoDark, AppTheme.primaryIndigoLight],
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryIndigo.withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -12,
            bottom: -12,
            child: Icon(Icons.trending_up,
                size: 80, color: Colors.white.withValues(alpha: 0.14)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Total Actions',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.white70,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _loadingStats ? '–' : '$total',
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            height: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.bolt_rounded,
                        color: Colors.white, size: 16),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'All time',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ============ FILTERS ============

  Widget _buildFilterPanel() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: AppTheme.primaryIndigo50,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(Icons.tune,
                    size: 14, color: AppTheme.primaryIndigo),
              ),
              const SizedBox(width: 8),
              const Text(
                'Filters',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground,
                ),
              ),
              const Spacer(),
              if (_hasFilters)
                TextButton.icon(
                  onPressed: _clearFilters,
                  icon: const Icon(Icons.clear_all, size: 16),
                  label: const Text('Clear', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.red.shade600,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _filterPicker(
                  label: 'Type',
                  icon: Icons.category_outlined,
                  value: _labelFor(_typeOptions, _typeFilter),
                  active: _typeFilter != 'All',
                  onTap: () => _showOptionSheet(
                    'Filter by type',
                    _typeOptions,
                    _typeFilter,
                    (v) => setState(() => _typeFilter = v),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _filterPicker(
                  label: 'Action',
                  icon: Icons.flash_on_outlined,
                  value: _labelFor(_actionOptions, _actionFilter),
                  active: _actionFilter != 'All',
                  onTap: () => _showOptionSheet(
                    'Filter by action',
                    _actionOptions,
                    _actionFilter,
                    (v) => setState(() => _actionFilter = v),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _filterPicker(
                  label: 'From',
                  icon: Icons.calendar_today_outlined,
                  value: _fromDate != null
                      ? DateFormat('dd MMM yyyy').format(_fromDate!)
                      : 'Any',
                  active: _fromDate != null,
                  onTap: () => _pickDate(true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _filterPicker(
                  label: 'To',
                  icon: Icons.calendar_today_outlined,
                  value: _toDate != null
                      ? DateFormat('dd MMM yyyy').format(_toDate!)
                      : 'Any',
                  active: _toDate != null,
                  onTap: () => _pickDate(false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _fetchHistory,
              icon: const Icon(Icons.search, size: 18),
              label: const Text(
                'Apply Filters',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.saffron,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterPicker({
    required String label,
    required IconData icon,
    required String value,
    required bool active,
    required VoidCallback onTap,
  }) {
    final fg = active ? AppTheme.primaryIndigo : AppTheme.foreground;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppTheme.primaryIndigo50 : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? AppTheme.primaryIndigo : Colors.grey.shade200,
            width: active ? 1.2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 15, color: fg),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                      color: Colors.grey.shade500,
                      letterSpacing: 0.5,
                    ),
                  ),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: fg,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(Icons.keyboard_arrow_down,
                size: 16, color: Colors.grey.shade500),
          ],
        ),
      ),
    );
  }

  void _showOptionSheet(
    String title,
    List<_Opt> options,
    String current,
    ValueChanged<String> onPick,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 10),
              ...options.map((o) {
                final selected = o.value == current;
                return InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () {
                    onPick(o.value);
                    Navigator.pop(ctx);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    margin: const EdgeInsets.only(bottom: 6),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppTheme.primaryIndigo50
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: selected
                            ? AppTheme.primaryIndigo
                            : Colors.grey.shade200,
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            o.label,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected
                                  ? AppTheme.primaryIndigo
                                  : AppTheme.foreground,
                            ),
                          ),
                        ),
                        if (selected)
                          const Icon(Icons.check_circle,
                              color: AppTheme.primaryIndigo, size: 20),
                      ],
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAppliedFilters() {
    final chips = <Widget>[];
    if (_typeFilter != 'All') {
      chips.add(_appliedChip(
        'Type: ${_labelFor(_typeOptions, _typeFilter)}',
        () => setState(() => _typeFilter = 'All'),
      ));
    }
    if (_actionFilter != 'All') {
      chips.add(_appliedChip(
        'Action: ${_labelFor(_actionOptions, _actionFilter)}',
        () => setState(() => _actionFilter = 'All'),
      ));
    }
    if (_fromDate != null) {
      chips.add(_appliedChip(
        'From: ${DateFormat('dd MMM').format(_fromDate!)}',
        () => setState(() => _fromDate = null),
      ));
    }
    if (_toDate != null) {
      chips.add(_appliedChip(
        'To: ${DateFormat('dd MMM').format(_toDate!)}',
        () => setState(() => _toDate = null),
      ));
    }
    return Wrap(spacing: 6, runSpacing: 6, children: chips);
  }

  Widget _appliedChip(String label, VoidCallback onRemove) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.primaryIndigo100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: AppTheme.primaryIndigo,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: () {
              onRemove();
              _fetchHistory();
            },
            child: Container(
              width: 18,
              height: 18,
              decoration: const BoxDecoration(
                color: AppTheme.primaryIndigo,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, size: 12, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  // ============ LOG ============

  Widget _buildLogHeader() {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: AppTheme.saffron,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'Action Log',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: AppTheme.primaryIndigo900,
          ),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppTheme.primaryIndigo50,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            '${_items.length} ${_items.length == 1 ? 'entry' : 'entries'}',
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.primaryIndigo,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLogCard(Map<String, dynamic> item) {
    final type = (item['type'] ?? '').toString();
    final action = (item['action'] ?? '').toString();
    final title = (item['title'] ?? '-').toString();
    final description = (item['description'] ?? '').toString();
    final actionBy = item['actionBy'];
    final actionByName = actionBy is Map ? (actionBy['name'] ?? '—').toString() : '—';
    final actionAt = item['actionAt'];

    String relative = '-';
    String absolute = '-';
    if (actionAt != null) {
      try {
        final d = DateTime.parse(actionAt.toString()).toLocal();
        relative = _relativeTime(d);
        absolute = DateFormat('dd MMM yyyy, hh:mm a').format(d);
      } catch (_) {}
    }

    final typeMeta = _typeMeta(type);
    final actionMeta = _actionMeta(action);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _showDetailSheet(item),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: typeMeta.color),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: typeMeta.color.withValues(alpha: 0.10),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(typeMeta.icon,
                                    color: typeMeta.color, size: 11),
                                const SizedBox(width: 4),
                                Text(
                                  typeMeta.label,
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.6,
                                    color: typeMeta.color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          _actionChip(action, actionMeta),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.foreground,
                          height: 1.25,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (description.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          description,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                            height: 1.3,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Icon(Icons.person_outline,
                              size: 13, color: Colors.grey.shade500),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              actionByName,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Colors.grey.shade700,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Icon(Icons.schedule,
                              size: 13, color: Colors.grey.shade500),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Tooltip(
                              message: absolute,
                              child: Text(
                                relative,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.grey.shade700,
                                  fontWeight: FontWeight.w500,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Icon(Icons.visibility_outlined,
                                size: 13, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actionChip(String action, _ActionMeta meta) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: meta.bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: meta.fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(meta.icon, size: 11, color: meta.fg),
          const SizedBox(width: 4),
          Text(
            action.isEmpty ? '-' : action,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: meta.fg,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }

  // ============ DETAIL SHEET ============

  /// Admin-only action: flips a RESOLVED grievance back to OPEN by calling
  /// PATCH /api/grievances/:id/status. This is the **only** entry point for
  /// re-opening a grievance — the view page no longer exposes a status
  /// toggle. Closes the detail sheet and refreshes the history list on
  /// success.
  Future<void> _reopenGrievance(BuildContext sheetCtx, String id) async {
    if (id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Missing grievance ID')),
      );
      return;
    }
    final confirm = await showDialog<bool>(
      context: sheetCtx,
      builder: (ctx) => AlertDialog(
        title: const Text('Reopen Grievance?'),
        content: const Text(
          'This will move the grievance back to OPEN status and make it editable again. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.saffron,
              foregroundColor: Colors.black,
            ),
            child: const Text('Reopen'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res = await HttpService.patch(
        '/api/grievances/$id/status',
        {'status': 'OPEN'},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        if (Navigator.of(sheetCtx).canPop()) Navigator.pop(sheetCtx);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Grievance reopened')),
        );
        await Future.wait([_fetchStats(), _fetchHistory()]);
      } else {
        String msg = 'Failed to reopen (${res.statusCode})';
        try {
          final data = jsonDecode(res.body);
          msg = data['message'] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Server error / No internet')),
      );
    }
  }

  void _showDetailSheet(Map<String, dynamic> item) {
    final type = (item['type'] ?? '').toString();
    final typeMeta = _typeMeta(type);
    final action = (item['action'] ?? '').toString();
    final title = (item['title'] ?? '-').toString();
    final description = (item['description'] ?? '').toString();
    final actionBy = item['actionBy'];
    final actionByName = actionBy is Map ? (actionBy['name'] ?? '—').toString() : '—';
    final actionByEmail = actionBy is Map ? (actionBy['email'] ?? '').toString() : '';
    final actionAt = item['actionAt'];
    final status = (item['status'] ?? '').toString();
    final details = (item['details'] is Map)
        ? Map<String, dynamic>.from(item['details'])
        : <String, dynamic>{};

    String formattedDate = '-';
    if (actionAt != null) {
      try {
        final d = DateTime.parse(actionAt.toString()).toLocal();
        formattedDate = DateFormat('dd MMM yyyy, hh:mm:ss a').format(d);
      } catch (_) {}
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (ctx, controller) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      typeMeta.color.withValues(alpha: 0.08),
                      typeMeta.color.withValues(alpha: 0.02),
                    ],
                  ),
                  border: Border(
                    bottom: BorderSide(color: AppTheme.border),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: typeMeta.color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(typeMeta.icon, color: typeMeta.color, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            typeMeta.label,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: typeMeta.color,
                              letterSpacing: 0.6,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _actionChip(action, _actionMeta(action)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: controller,
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (description.isNotEmpty)
                      _detailRow('Summary', description),
                    _detailRow('Status', status.isEmpty ? '-' : status),
                    _detailRow('Action By', actionByName),
                    if (actionByEmail.isNotEmpty)
                      _detailRow('Email', actionByEmail),
                    _detailRow('Date / Time', formattedDate),
                    if (details.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      _sectionLabel('Additional Details'),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Column(
                          children: details.entries
                              .where((e) =>
                                  e.value != null &&
                                  e.value.toString().isNotEmpty)
                              .map((e) => _detailRow(
                                  _humanize(e.key), _formatValue(e.value),
                                  dense: true))
                              .toList(),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      if (type == 'GRIEVANCE' &&
                          status.toUpperCase() == 'RESOLVED')
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => _reopenGrievance(
                                ctx, (item['id'] ?? '').toString()),
                            icon: const Icon(Icons.restart_alt, size: 18),
                            label: const Text('Reopen Grievance'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.saffron,
                              foregroundColor: Colors.black,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 13),
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                          ),
                        ),
                      if (type == 'GRIEVANCE' &&
                          status.toUpperCase() == 'RESOLVED')
                        const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primaryIndigo,
                            foregroundColor: Colors.white,
                            padding:
                                const EdgeInsets.symmetric(vertical: 13),
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: const Text('Close',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: Colors.grey.shade600,
          letterSpacing: 0.5,
        ),
      );

  Widget _detailRow(String label, String value, {bool dense = false}) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: dense ? 4 : 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============ HELPERS ============

  String _labelFor(List<_Opt> options, String value) {
    final m =
        options.firstWhere((o) => o.value == value, orElse: () => options[0]);
    return m.label;
  }

  String _relativeTime(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
    return DateFormat('dd MMM yyyy').format(d);
  }

  String _humanize(String key) {
    final spaced = key.replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}');
    return spaced[0].toUpperCase() + spaced.substring(1);
  }

  String _formatValue(dynamic v) {
    if (v == null) return '-';
    if (v is Map) {
      if (v['name'] != null) return v['name'].toString();
      return v.toString();
    }
    if (v is String) {
      final parsed = DateTime.tryParse(v);
      if (parsed != null && v.contains('T')) {
        return DateFormat('dd MMM yyyy, hh:mm a').format(parsed.toLocal());
      }
      return v;
    }
    return v.toString();
  }

  _TypeMeta _typeMeta(String type) {
    switch (type) {
      case 'GRIEVANCE':
        return const _TypeMeta(
            'GRIEVANCE', AppTheme.primaryIndigo, Icons.description_outlined);
      case 'TRAIN_REQUEST':
        return const _TypeMeta(
            'TRAIN REQUEST', Color(0xFF0EA5E9), Icons.train_outlined);
      case 'TOUR_PROGRAM':
        return const _TypeMeta(
            'TOUR PROGRAM', AppTheme.saffronDark, Icons.event_outlined);
      default:
        return const _TypeMeta('ACTION', AppTheme.muted, Icons.history);
    }
  }

  _ActionMeta _actionMeta(String action) {
    final a = action.toLowerCase();
    if (a.contains('reject') || a.contains('regret')) {
      return _ActionMeta(
          Colors.red.shade50, Colors.red.shade700, Icons.cancel);
    }
    if (a.contains('resolve')) {
      return _ActionMeta(
          Colors.green.shade50, Colors.green.shade700, Icons.task_alt);
    }
    if (a.contains('accept') || a.contains('approve')) {
      return _ActionMeta(
          Colors.green.shade50, Colors.green.shade700, Icons.check_circle);
    }
    if (a.contains('verif')) {
      return _ActionMeta(
          Colors.indigo.shade50, Colors.indigo.shade700, Icons.verified);
    }
    if (a.contains('progress')) {
      return _ActionMeta(
          Colors.amber.shade50, Colors.amber.shade800, Icons.autorenew);
    }
    return _ActionMeta(
        Colors.grey.shade100, Colors.grey.shade700, Icons.circle);
  }

  Widget _buildError() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 30),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.cloud_off,
                size: 30, color: Colors.red.shade400),
          ),
          const SizedBox(height: 14),
          const Text('Something went wrong',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground)),
          const SizedBox(height: 4),
          Text(_error ?? 'Error',
              style: TextStyle(
                  color: Colors.grey.shade600, fontSize: 12),
              textAlign: TextAlign.center),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: _loadAll,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryIndigo,
              foregroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 30),
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppTheme.primaryIndigo50,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.search_off,
                size: 32, color: AppTheme.primaryIndigo),
          ),
          const SizedBox(height: 14),
          const Text('No actions found',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground)),
          const SizedBox(height: 4),
          Text(
            _hasFilters
                ? 'Try adjusting your filters'
                : 'No administrative actions yet',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            textAlign: TextAlign.center,
          ),
          if (_hasFilters) ...[
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _clearFilters,
              icon: const Icon(Icons.clear_all, size: 16),
              label: const Text('Clear filters'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primaryIndigo,
                side: const BorderSide(color: AppTheme.primaryIndigo),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Opt {
  final String value;
  final String label;
  const _Opt(this.value, this.label);
}

class _BD {
  final String label;
  final Color color;
  final IconData icon;
  const _BD(this.label, this.color, this.icon);
}

class _TypeMeta {
  final String label;
  final Color color;
  final IconData icon;
  const _TypeMeta(this.label, this.color, this.icon);
}

class _ActionMeta {
  final Color bg;
  final Color fg;
  final IconData icon;
  const _ActionMeta(this.bg, this.fg, this.icon);
}
