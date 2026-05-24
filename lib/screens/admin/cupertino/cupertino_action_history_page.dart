import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors;
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';

class CupertinoActionHistoryPage extends StatefulWidget {
  const CupertinoActionHistoryPage({super.key});

  @override
  State<CupertinoActionHistoryPage> createState() =>
      _CupertinoActionHistoryPageState();
}

class _CupertinoActionHistoryPageState
    extends State<CupertinoActionHistoryPage> {
  bool _loadingList = true;
  bool _loadingStats = true;
  String? _error;

  List<Map<String, dynamic>> _items = [];
  Map<String, dynamic> _stats = {};

  String _typeFilter = 'All';
  String _actionFilter = 'All';
  DateTime? _fromDate;
  DateTime? _toDate;

  static const List<List<String>> _typeOptions = [
    ['All', 'All Types'],
    ['GRIEVANCE', 'Grievance'],
    ['TEMPLE_VISIT', 'Temple Visit'],
    ['TRAIN_REQUEST', 'Train Request'],
    ['TOUR_PROGRAM', 'Tour Program'],
  ];

  static const List<List<String>> _actionOptions = [
    ['All', 'All Actions'],
    ['VERIFIED', 'Verified'],
    ['RESOLVED', 'Resolved'],
    ['REJECTED', 'Rejected'],
    ['IN_PROGRESS', 'In Progress'],
    ['ACCEPTED', 'Accepted'],
    ['REGRET', 'Regret'],
  ];

  @override
  void initState() {
    super.initState();
    _loadAll();
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
            : (decoded is Map
                ? Map<String, dynamic>.from(decoded)
                : <String, dynamic>{});
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
      // TOUR_PROGRAM. Temple Visit is a subset of GRIEVANCE rows, narrowed
      // client-side below using `details.grievanceType`.
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
        final endOfDay =
            DateTime(_toDate!.year, _toDate!.month, _toDate!.day, 23, 59, 59);
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
            : (decoded is Map && decoded['data'] is List
                ? decoded['data']
                : []);
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

  void _showOptionPicker(
    String title,
    List<List<String>> options,
    String current,
    ValueChanged<String> onPick,
  ) {
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey4,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
                child: Row(
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                  ],
                ),
              ),
              ...options.map((o) {
                final selected = o[0] == current;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    onPick(o[0]);
                    Navigator.pop(ctx);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: CupertinoColors.systemGrey5
                              .withValues(alpha: 0.5),
                          width: 0.5,
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            o[1],
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected
                                  ? AppTheme.primaryIndigo
                                  : AppTheme.foreground,
                            ),
                          ),
                        ),
                        if (selected)
                          const Icon(CupertinoIcons.check_mark,
                              color: AppTheme.primaryIndigo, size: 20),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  void _showDatePicker(bool isFrom) {
    DateTime initial =
        isFrom ? (_fromDate ?? DateTime.now()) : (_toDate ?? DateTime.now());
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: 290,
        decoration: const BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey4,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    CupertinoButton(
                      onPressed: () {
                        setState(() {
                          if (isFrom) {
                            _fromDate = null;
                          } else {
                            _toDate = null;
                          }
                        });
                        Navigator.pop(ctx);
                      },
                      child: const Text('Clear',
                          style: TextStyle(color: CupertinoColors.systemRed)),
                    ),
                    Text(isFrom ? 'From Date' : 'To Date',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: AppTheme.foreground)),
                    CupertinoButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Done',
                          style: TextStyle(
                              color: AppTheme.primaryIndigo,
                              fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: initial,
                  minimumDate: DateTime(2020),
                  maximumDate: DateTime.now().add(const Duration(days: 30)),
                  onDateTimeChanged: (d) {
                    setState(() {
                      if (isFrom) {
                        _fromDate = d;
                      } else {
                        _toDate = d;
                      }
                    });
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _labelFor(List<List<String>> options, String value) {
    final m =
        options.firstWhere((o) => o[0] == value, orElse: () => options[0]);
    return m[1];
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
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: 'Action History',
            trailing: GestureDetector(
              onTap: _loadAll,
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child:
                    Icon(CupertinoIcons.refresh, color: CupertinoColors.white),
              ),
            ),
          ),
          Expanded(
            child: CustomScrollView(
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _loadAll),
                SliverToBoxAdapter(child: _buildHeroBanner()),
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
                          child: Center(
                              child: CupertinoActivityIndicator(radius: 14)),
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
        ],
      ),
    );
  }

  Widget _buildHeroBanner() {
    return Container(
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
      child: ClipRect(
        child: Stack(
          children: [
            Positioned(
              right: -20,
              top: 0,
              child: Icon(
                CupertinoIcons.clock,
                size: 130,
                color: CupertinoColors.white.withValues(alpha: 0.06),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: CupertinoColors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'AUDIT LOG',
                      style: TextStyle(
                        color: CupertinoColors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'View all administrative actions',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Approvals, rejections, and verifications',
                    style: TextStyle(
                      color: CupertinoColors.white.withValues(alpha: 0.85),
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
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
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.55,
      children: [
        _statCard(
          icon: CupertinoIcons.doc_text,
          accent: AppTheme.primaryIndigo,
          accentBg: AppTheme.primaryIndigo50,
          title: 'Grievances',
          total: g['total'] ?? 0,
          breakdown: [
            _BD('${g['resolved'] ?? 0} resolved', Colors.green.shade600,
                CupertinoIcons.check_mark_circled_solid),
            _BD('${g['rejected'] ?? 0} rejected', Colors.red.shade500,
                CupertinoIcons.xmark_circle_fill),
          ],
        ),
        _statCard(
          icon: CupertinoIcons.train_style_one,
          accent: const Color(0xFF0EA5E9),
          accentBg: const Color(0xFFE0F2FE),
          title: 'Train Requests',
          total: t['total'] ?? 0,
          breakdown: [
            _BD('${t['approved'] ?? 0} accepted', Colors.green.shade600,
                CupertinoIcons.check_mark_circled_solid),
            _BD('${t['rejected'] ?? 0} regret', Colors.red.shade500,
                CupertinoIcons.xmark_circle_fill),
            _BD('${t['resolved'] ?? 0} resolved', Colors.blueGrey.shade400,
                CupertinoIcons.check_mark_circled),
          ],
        ),
        _statCard(
          icon: CupertinoIcons.calendar,
          accent: AppTheme.saffronDark,
          accentBg: AppTheme.saffronSoft,
          title: 'Tour Programs',
          total: tp['total'] ?? 0,
          breakdown: [
            _BD('${tp['accepted'] ?? 0} accepted', Colors.green.shade600,
                CupertinoIcons.check_mark_circled_solid),
            _BD('${tp['regret'] ?? 0} regret', AppTheme.saffronDark,
                CupertinoIcons.exclamationmark_triangle_fill),
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
        color: CupertinoColors.white,
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
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.muted,
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
                    ? const Center(child: CupertinoActivityIndicator(radius: 7))
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
            child: Icon(
              CupertinoIcons.chart_bar_alt_fill,
              size: 80,
              color: CupertinoColors.white.withValues(alpha: 0.14),
            ),
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
                            color: CupertinoColors.white,
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
                            color: CupertinoColors.white,
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
                      color: CupertinoColors.white.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(CupertinoIcons.bolt_fill,
                        color: CupertinoColors.white, size: 16),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: CupertinoColors.white.withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'All time',
                  style: TextStyle(
                    fontSize: 10,
                    color: CupertinoColors.white,
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
        color: CupertinoColors.white,
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
                child: const Icon(CupertinoIcons.slider_horizontal_3,
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
                CupertinoButton(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  minSize: 0,
                  onPressed: _clearFilters,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.clear_circled_solid,
                          size: 14, color: Colors.red.shade600),
                      const SizedBox(width: 4),
                      Text('Clear',
                          style: TextStyle(
                              fontSize: 12,
                              color: Colors.red.shade600,
                              fontWeight: FontWeight.w600)),
                    ],
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
                  icon: CupertinoIcons.square_grid_2x2,
                  value: _labelFor(_typeOptions, _typeFilter),
                  active: _typeFilter != 'All',
                  onTap: () => _showOptionPicker(
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
                  icon: CupertinoIcons.bolt,
                  value: _labelFor(_actionOptions, _actionFilter),
                  active: _actionFilter != 'All',
                  onTap: () => _showOptionPicker(
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
                  icon: CupertinoIcons.calendar,
                  value: _fromDate != null
                      ? DateFormat('dd MMM yyyy').format(_fromDate!)
                      : 'Any',
                  active: _fromDate != null,
                  onTap: () => _showDatePicker(true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _filterPicker(
                  label: 'To',
                  icon: CupertinoIcons.calendar,
                  value: _toDate != null
                      ? DateFormat('dd MMM yyyy').format(_toDate!)
                      : 'Any',
                  active: _toDate != null,
                  onTap: () => _showDatePicker(false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 13),
              color: AppTheme.saffron,
              borderRadius: BorderRadius.circular(10),
              onPressed: _fetchHistory,
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(CupertinoIcons.search,
                      color: CupertinoColors.white, size: 17),
                  SizedBox(width: 6),
                  Text(
                    'Apply Filters',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
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
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
        decoration: BoxDecoration(
          color:
              active ? AppTheme.primaryIndigo50 : CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color:
                active ? AppTheme.primaryIndigo : CupertinoColors.systemGrey5,
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
                    style: const TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.muted,
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
            const Icon(CupertinoIcons.chevron_down,
                size: 12, color: AppTheme.muted),
          ],
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
              child: const Icon(CupertinoIcons.xmark,
                  size: 10, color: CupertinoColors.white),
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
    final actionByName =
        actionBy is Map ? (actionBy['name'] ?? '—').toString() : '—';
    final actionAt = item['actionAt'];

    String relative = '-';
    if (actionAt != null) {
      try {
        final d = DateTime.parse(actionAt.toString()).toLocal();
        relative = _relativeTime(d);
      } catch (_) {}
    }

    final typeMeta = _typeMeta(type);
    final actionMeta = _actionMeta(action);

    return GestureDetector(
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
          boxShadow: AppTheme.shadowSm,
        ),
        clipBehavior: Clip.antiAlias,
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
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.muted,
                            height: 1.3,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(CupertinoIcons.person,
                              size: 13, color: AppTheme.muted),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              actionByName,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppTheme.muted,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 10),
                          const Icon(CupertinoIcons.time,
                              size: 13, color: AppTheme.muted),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              relative,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppTheme.muted,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: CupertinoColors.systemGrey6,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(CupertinoIcons.eye,
                                size: 13, color: AppTheme.muted),
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

  /// Admin-only action: flips a RESOLVED grievance back to OPEN. This is the
  /// **only** entry point for reopening — the view page no longer exposes a
  /// status toggle.
  Future<void> _reopenGrievance(BuildContext sheetCtx, String id) async {
    if (id.isEmpty) {
      CupertinoToast.show(context, 'Missing grievance ID', isError: true);
      return;
    }
    final confirm = await showCupertinoDialog<bool>(
      context: sheetCtx,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Reopen Grievance?'),
        content: const Text(
          'This will move the grievance back to OPEN status and make it editable again. Continue?',
        ),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, 'Grievance reopened');
        await Future.wait([_fetchStats(), _fetchHistory()]);
      } else {
        String msg = 'Failed to reopen (${res.statusCode})';
        try {
          final data = jsonDecode(res.body);
          msg = data['message'] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (e) {
      if (!mounted) return;
      CupertinoToast.show(context, 'Server error / No internet', isError: true);
    }
  }

  void _showDetailSheet(Map<String, dynamic> item) {
    final type = (item['type'] ?? '').toString();
    final typeMeta = _typeMeta(type);
    final action = (item['action'] ?? '').toString();
    final title = (item['title'] ?? '-').toString();
    final description = (item['description'] ?? '').toString();
    final actionBy = item['actionBy'];
    final actionByName =
        actionBy is Map ? (actionBy['name'] ?? '—').toString() : '—';
    final actionByEmail =
        actionBy is Map ? (actionBy['email'] ?? '').toString() : '';
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

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: MediaQuery.of(ctx).size.height * 0.82,
        decoration: const BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey4,
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
                border: Border(bottom: BorderSide(color: AppTheme.border)),
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
                        color: CupertinoColors.systemGrey6,
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
                        child: CupertinoButton(
                          color: AppTheme.saffron,
                          borderRadius: BorderRadius.circular(10),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          onPressed: () => _reopenGrievance(
                              ctx, (item['id'] ?? '').toString()),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(CupertinoIcons.arrow_2_circlepath,
                                  size: 18, color: CupertinoColors.black),
                              SizedBox(width: 6),
                              Text('Reopen Grievance',
                                  style: TextStyle(
                                    color: CupertinoColors.black,
                                    fontWeight: FontWeight.bold,
                                  )),
                            ],
                          ),
                        ),
                      ),
                    if (type == 'GRIEVANCE' &&
                        status.toUpperCase() == 'RESOLVED')
                      const SizedBox(width: 10),
                    Expanded(
                      child: CupertinoButton(
                        color: AppTheme.primaryIndigo,
                        borderRadius: BorderRadius.circular(10),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        onPressed: () => Navigator.pop(ctx),
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
    );
  }

  Widget _sectionLabel(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: AppTheme.muted,
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
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.muted,
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
            'GRIEVANCE', AppTheme.primaryIndigo, CupertinoIcons.doc_text);
      case 'TRAIN_REQUEST':
        return const _TypeMeta(
            'TRAIN REQUEST', Color(0xFF0EA5E9), CupertinoIcons.train_style_one);
      case 'TOUR_PROGRAM':
        return const _TypeMeta(
            'TOUR PROGRAM', AppTheme.saffronDark, CupertinoIcons.calendar);
      default:
        return const _TypeMeta('ACTION', AppTheme.muted, CupertinoIcons.clock);
    }
  }

  _ActionMeta _actionMeta(String action) {
    final a = action.toLowerCase();
    if (a.contains('reject') || a.contains('regret')) {
      return _ActionMeta(Colors.red.shade50, Colors.red.shade700,
          CupertinoIcons.xmark_circle_fill);
    }
    if (a.contains('resolve')) {
      return _ActionMeta(Colors.green.shade50, Colors.green.shade700,
          CupertinoIcons.checkmark_seal_fill);
    }
    if (a.contains('accept') || a.contains('approve')) {
      return _ActionMeta(Colors.green.shade50, Colors.green.shade700,
          CupertinoIcons.check_mark_circled_solid);
    }
    if (a.contains('verif')) {
      return _ActionMeta(Colors.indigo.shade50, Colors.indigo.shade700,
          CupertinoIcons.checkmark_shield_fill);
    }
    if (a.contains('progress')) {
      return _ActionMeta(Colors.amber.shade50, Colors.amber.shade800,
          CupertinoIcons.arrow_2_circlepath);
    }
    return _ActionMeta(
        Colors.grey.shade100, Colors.grey.shade700, CupertinoIcons.circle_fill);
  }

  Widget _buildError() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 30),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
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
            child: Icon(CupertinoIcons.cloud_bolt,
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
              style: const TextStyle(color: AppTheme.muted, fontSize: 12),
              textAlign: TextAlign.center),
          const SizedBox(height: 14),
          CupertinoButton(
            color: AppTheme.primaryIndigo,
            borderRadius: BorderRadius.circular(10),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            onPressed: _loadAll,
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(CupertinoIcons.refresh,
                    size: 16, color: CupertinoColors.white),
                SizedBox(width: 6),
                Text('Retry', style: TextStyle(color: CupertinoColors.white)),
              ],
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
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppTheme.primaryIndigo50,
              shape: BoxShape.circle,
            ),
            child: const Icon(CupertinoIcons.search,
                size: 30, color: AppTheme.primaryIndigo),
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
            style: const TextStyle(color: AppTheme.muted, fontSize: 12),
            textAlign: TextAlign.center,
          ),
          if (_hasFilters) ...[
            const SizedBox(height: 14),
            CupertinoButton(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppTheme.primaryIndigo50,
              borderRadius: BorderRadius.circular(10),
              onPressed: _clearFilters,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.clear_circled,
                      size: 14, color: AppTheme.primaryIndigo),
                  SizedBox(width: 4),
                  Text('Clear filters',
                      style: TextStyle(color: AppTheme.primaryIndigo)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
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
