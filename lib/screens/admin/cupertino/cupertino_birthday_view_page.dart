import 'dart:async';
import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors;
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';

class CupertinoBirthdayViewPage extends StatefulWidget {
  const CupertinoBirthdayViewPage({super.key});

  @override
  State<CupertinoBirthdayViewPage> createState() =>
      _CupertinoBirthdayViewPageState();
}

class _CupertinoBirthdayViewPageState extends State<CupertinoBirthdayViewPage> {
  static const Color _pink = Color(0xFFEC4899);
  static const Color _pinkDark = Color(0xFFBE185D);
  static const Color _pinkLight = Color(0xFFF472B6);
  static const Color _pinkBg = Color(0xFFFDF2F8);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  int _monthFilter = 0;
  String _nameQuery = '';
  final TextEditingController _searchCtrl = TextEditingController();
  Timer? _debounce;

  static const List<String> _monthNames = [
    'All Months',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final params = <String, String>{'limit': '200'};
      if (_monthFilter > 0) params['month'] = _monthFilter.toString();
      if (_nameQuery.isNotEmpty) params['search'] = _nameQuery;

      final qs = params.entries
          .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
          .join('&');
      final res = await HttpService.get('/api/birthdays?$qs');

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List
            ? decoded
            : (decoded is Map && decoded['data'] is List ? decoded['data'] : []);
        if (mounted) {
          setState(() {
            _items = list
                .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
                .toList();
            _loading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = 'Failed to load (${res.statusCode})';
            _loading = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Server error / No internet';
          _loading = false;
        });
      }
    }
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(() => _nameQuery = v.trim());
      _fetch();
    });
  }

  void _showMonthPicker() {
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
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 14, 20, 6),
                child: Row(
                  children: [
                    Text(
                      'Filter by birth month',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                  ],
                ),
              ),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(ctx).size.height * 0.6,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    children: List.generate(_monthNames.length, (i) {
                      final selected = i == _monthFilter;
                      return GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          setState(() => _monthFilter = i);
                          Navigator.pop(ctx);
                          _fetch();
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
                              Icon(
                                i == 0
                                    ? CupertinoIcons.infinite
                                    : CupertinoIcons.calendar,
                                size: 16,
                                color:
                                    selected ? _pink : CupertinoColors.systemGrey,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _monthNames[i],
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: selected
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                    color: selected
                                        ? _pink
                                        : AppTheme.foreground,
                                  ),
                                ),
                              ),
                              if (selected)
                                const Icon(CupertinoIcons.check_mark,
                                    color: _pink, size: 20),
                            ],
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  void _clearFilters() {
    setState(() {
      _monthFilter = 0;
      _nameQuery = '';
      _searchCtrl.clear();
    });
    _fetch();
  }

  bool get _hasFilters => _monthFilter > 0 || _nameQuery.isNotEmpty;

  int? _ageFromDob(dynamic dob) {
    if (dob == null) return null;
    try {
      final d = DateTime.parse(dob.toString());
      final now = DateTime.now();
      var age = now.year - d.year;
      if (now.month < d.month ||
          (now.month == d.month && now.day < d.day)) {
        age--;
      }
      return age >= 0 ? age : null;
    } catch (_) {
      return null;
    }
  }

  int? _daysUntilNext(dynamic dob) {
    if (dob == null) return null;
    try {
      final d = DateTime.parse(dob.toString());
      final now = DateTime.now();
      var next = DateTime(now.year, d.month, d.day);
      if (next.isBefore(DateTime(now.year, now.month, now.day))) {
        next = DateTime(now.year + 1, d.month, d.day);
      }
      return next.difference(DateTime(now.year, now.month, now.day)).inDays;
    } catch (_) {
      return null;
    }
  }

  String _dobShort(dynamic dob) {
    if (dob == null) return '-';
    try {
      final d = DateTime.parse(dob.toString());
      return DateFormat('dd MMM').format(d);
    } catch (_) {
      return '-';
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: _pinkDark,
        border: null,
        middle: const Text(
          'View Birthdays',
          style:
              TextStyle(color: CupertinoColors.white, fontWeight: FontWeight.bold),
        ),
        leading: CupertinoNavigationBarBackButton(
          color: CupertinoColors.white,
          onPressed: () => Navigator.pop(context),
        ),
        trailing: GestureDetector(
          onTap: _fetch,
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Icon(CupertinoIcons.refresh, color: CupertinoColors.white),
          ),
        ),
      ),
      child: SafeArea(
        child: CustomScrollView(
          slivers: [
            CupertinoSliverRefreshControl(onRefresh: _fetch),
            SliverToBoxAdapter(child: _buildHeroBanner()),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  _buildFilterPanel(),
                  if (_hasFilters) ...[
                    const SizedBox(height: 10),
                    _buildAppliedFilters(),
                  ],
                  const SizedBox(height: 16),
                  _buildListHeader(),
                  const SizedBox(height: 10),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child:
                          Center(child: CupertinoActivityIndicator(radius: 14)),
                    )
                  else if (_error != null)
                    _buildError()
                  else if (_items.isEmpty)
                    _buildEmpty()
                  else
                    ..._items.map(_buildBirthdayCard),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroBanner() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_pinkDark, _pink, _pinkLight],
        ),
      ),
      child: ClipRect(
        child: Stack(
          children: [
            Positioned(
              right: -20,
              top: 0,
              child: Icon(
                CupertinoIcons.gift,
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
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: CupertinoColors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'BIRTHDAY DIRECTORY',
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
                    'Browse all saved birthdays',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Filter by month or search by name',
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
                  color: _pinkBg,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(CupertinoIcons.slider_horizontal_3,
                    size: 14, color: _pink),
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
                  minimumSize: Size.zero,
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
          // Name search
          CupertinoSearchTextField(
            controller: _searchCtrl,
            placeholder: 'Search by name…',
            onChanged: _onSearchChanged,
            style: const TextStyle(fontSize: 14, color: AppTheme.foreground),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: CupertinoColors.systemGrey5),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 11),
          ),
          const SizedBox(height: 10),
          // Month picker
          GestureDetector(
            onTap: _showMonthPicker,
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: _monthFilter > 0
                    ? _pinkBg
                    : CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: _monthFilter > 0
                      ? _pink
                      : CupertinoColors.systemGrey5,
                  width: _monthFilter > 0 ? 1.2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.calendar,
                    size: 16,
                    color: _monthFilter > 0 ? _pink : AppTheme.muted,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Birth Month',
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.muted,
                            letterSpacing: 0.5,
                          ),
                        ),
                        Text(
                          _monthNames[_monthFilter],
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _monthFilter > 0
                                ? _pink
                                : AppTheme.foreground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(CupertinoIcons.chevron_down,
                      size: 12, color: AppTheme.muted),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppliedFilters() {
    final chips = <Widget>[];
    if (_monthFilter > 0) {
      chips.add(_appliedChip(
        'Month: ${_monthNames[_monthFilter]}',
        () => setState(() => _monthFilter = 0),
      ));
    }
    if (_nameQuery.isNotEmpty) {
      chips.add(_appliedChip(
        'Name: $_nameQuery',
        () {
          setState(() {
            _nameQuery = '';
            _searchCtrl.clear();
          });
        },
      ));
    }
    return Wrap(spacing: 6, runSpacing: 6, children: chips);
  }

  Widget _appliedChip(String label, VoidCallback onRemove) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
      decoration: BoxDecoration(
        color: _pinkBg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _pinkLight.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: _pinkDark,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: () {
              onRemove();
              _fetch();
            },
            child: Container(
              width: 18,
              height: 18,
              decoration: const BoxDecoration(
                color: _pink,
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

  // ============ LIST ============

  Widget _buildListHeader() {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: _pink,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'All Birthdays',
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
            color: _pinkBg,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            '${_items.length} ${_items.length == 1 ? 'person' : 'people'}',
            style: const TextStyle(
              fontSize: 11,
              color: _pinkDark,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBirthdayCard(Map<String, dynamic> item) {
    final name = (item['name'] ?? 'Unknown').toString();
    final phone = (item['phone'] ?? '').toString();
    final dob = item['dob'];
    final relation = (item['relation'] ?? '').toString();
    final designation = (item['designation'] ?? '').toString();

    final age = _ageFromDob(dob);
    final daysUntil = _daysUntilNext(dob);
    final dobShort = _dobShort(dob);
    final initials = _initials(name);

    final isToday = daysUntil == 0;
    final isSoon = daysUntil != null && daysUntil <= 7 && daysUntil > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isToday ? _pink : AppTheme.border,
          width: isToday ? 1.5 : 1,
        ),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [_pink, _pinkLight],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text(
              initials,
              style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.foreground,
                          height: 1.2,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    _daysPill(daysUntil),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(CupertinoIcons.gift,
                        size: 13, color: AppTheme.muted),
                    const SizedBox(width: 4),
                    Text(
                      dobShort,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.foreground,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (age != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        width: 3,
                        height: 3,
                        decoration: BoxDecoration(
                          color: AppTheme.muted,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Age $age',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.foreground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ],
                ),
                if (phone.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      const Icon(CupertinoIcons.phone,
                          size: 13, color: AppTheme.muted),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.foreground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
                if (relation.isNotEmpty || designation.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: [
                      if (relation.isNotEmpty) _tag(relation, _pinkBg, _pinkDark),
                      if (designation.isNotEmpty)
                        _tag(designation, AppTheme.primaryIndigo50,
                            AppTheme.primaryIndigo),
                    ],
                  ),
                ],
                if (isSoon) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(CupertinoIcons.time,
                          size: 12, color: Colors.orange.shade700),
                      const SizedBox(width: 4),
                      Text(
                        daysUntil == 1
                            ? 'Birthday tomorrow!'
                            : 'In $daysUntil days',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.orange.shade700,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _daysPill(int? daysUntil) {
    if (daysUntil == null) return const SizedBox.shrink();
    Color bg;
    Color fg;
    String label;
    IconData icon;
    if (daysUntil == 0) {
      bg = _pinkBg;
      fg = _pinkDark;
      label = 'Today!';
      icon = CupertinoIcons.gift_fill;
    } else if (daysUntil <= 7) {
      bg = Colors.orange.shade50;
      fg = Colors.orange.shade700;
      label = '${daysUntil}d';
      icon = CupertinoIcons.time;
    } else if (daysUntil <= 30) {
      bg = AppTheme.primaryIndigo50;
      fg = AppTheme.primaryIndigo;
      label = '${daysUntil}d';
      icon = CupertinoIcons.calendar;
    } else {
      bg = Colors.grey.shade100;
      fg = Colors.grey.shade700;
      label = '${daysUntil}d';
      icon = CupertinoIcons.calendar;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }

  Widget _tag(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 0.2,
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts.last[0]).toUpperCase();
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
            color: _pink,
            borderRadius: BorderRadius.circular(10),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            onPressed: _fetch,
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(CupertinoIcons.refresh,
                    size: 16, color: CupertinoColors.white),
                SizedBox(width: 6),
                Text('Retry',
                    style: TextStyle(color: CupertinoColors.white)),
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
              color: _pinkBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(CupertinoIcons.gift, size: 30, color: _pink),
          ),
          const SizedBox(height: 14),
          const Text('No birthdays found',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground)),
          const SizedBox(height: 4),
          Text(
            _hasFilters
                ? 'Try adjusting your filters'
                : 'No birthdays saved yet',
            style: const TextStyle(color: AppTheme.muted, fontSize: 12),
            textAlign: TextAlign.center,
          ),
          if (_hasFilters) ...[
            const SizedBox(height: 14),
            CupertinoButton(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: _pinkBg,
              borderRadius: BorderRadius.circular(10),
              onPressed: _clearFilters,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.clear_circled,
                      size: 14, color: _pink),
                  SizedBox(width: 4),
                  Text('Clear filters', style: TextStyle(color: _pink)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
