import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class BirthdayViewPage extends StatefulWidget {
  const BirthdayViewPage({super.key});

  @override
  State<BirthdayViewPage> createState() => _BirthdayViewPageState();
}

class _BirthdayViewPageState extends State<BirthdayViewPage> {
  static const Color _pink = Color(0xFFEC4899);
  static const Color _pinkDark = Color(0xFFBE185D);
  static const Color _pinkLight = Color(0xFFF472B6);
  static const Color _pinkBg = Color(0xFFFDF2F8);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  // Filters
  int _monthFilter = 0; // 0 = All
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
              const Text(
                'Filter by birth month',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 12),
              ...List.generate(_monthNames.length, (i) {
                final selected = i == _monthFilter;
                return InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () {
                    setState(() => _monthFilter = i);
                    Navigator.pop(ctx);
                    _fetch();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    margin: const EdgeInsets.only(bottom: 6),
                    decoration: BoxDecoration(
                      color: selected ? _pinkBg : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: selected ? _pink : Colors.grey.shade200,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          i == 0 ? Icons.all_inclusive : Icons.calendar_month,
                          size: 16,
                          color: selected ? _pink : Colors.grey.shade500,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _monthNames[i],
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected ? _pink : AppTheme.foreground,
                            ),
                          ),
                        ),
                        if (selected)
                          const Icon(Icons.check_circle, color: _pink, size: 20),
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
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: _pink,
        child: CustomScrollView(
          slivers: [
            _buildSliverAppBar(),
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
                      child: Center(child: CircularProgressIndicator(color: _pink)),
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

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      pinned: true,
      expandedHeight: 150,
      backgroundColor: _pinkDark,
      iconTheme: const IconThemeData(color: Colors.white),
      title: const Text(
        'View Birthdays',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          tooltip: 'Refresh',
          onPressed: _fetch,
        ),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [_pinkDark, _pink, _pinkLight],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -30,
                top: 20,
                child: Icon(
                  Icons.cake,
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'BIRTHDAY DIRECTORY',
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
                      'Browse all saved birthdays',
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
                  color: _pinkBg,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(Icons.tune, size: 14, color: _pink),
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
          // Name search
          TextField(
            controller: _searchCtrl,
            onChanged: _onSearchChanged,
            decoration: InputDecoration(
              hintText: 'Search by name…',
              hintStyle: TextStyle(
                color: Colors.grey.shade500,
                fontSize: 13.5,
              ),
              prefixIcon: const Icon(Icons.person_search,
                  size: 18, color: AppTheme.muted),
              suffixIcon: _searchCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () {
                        _searchCtrl.clear();
                        _onSearchChanged('');
                      },
                    )
                  : null,
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade200),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade200),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: _pink, width: 1.2),
              ),
            ),
          ),
          const SizedBox(height: 10),
          // Month picker
          InkWell(
            onTap: _showMonthPicker,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: _monthFilter > 0 ? _pinkBg : Colors.grey.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: _monthFilter > 0 ? _pink : Colors.grey.shade200,
                  width: _monthFilter > 0 ? 1.2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.calendar_month,
                    size: 16,
                    color: _monthFilter > 0 ? _pink : AppTheme.muted,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Birth Month',
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            color: Colors.grey.shade500,
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
                  Icon(Icons.keyboard_arrow_down,
                      size: 18, color: Colors.grey.shade500),
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
        () {
          setState(() => _monthFilter = 0);
        },
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
              child: const Icon(Icons.close, size: 12, color: Colors.white),
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
        color: Colors.white,
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
          // Avatar with initials
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
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Info
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
                    Icon(Icons.cake_outlined,
                        size: 13, color: Colors.grey.shade500),
                    const SizedBox(width: 4),
                    Text(
                      dobShort,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade700,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (age != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        width: 3,
                        height: 3,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade400,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Age $age',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
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
                      Icon(Icons.phone_outlined,
                          size: 13, color: Colors.grey.shade500),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
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
                      Icon(Icons.schedule, size: 12, color: Colors.orange.shade700),
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
      icon = Icons.celebration;
    } else if (daysUntil <= 7) {
      bg = Colors.orange.shade50;
      fg = Colors.orange.shade700;
      label = '${daysUntil}d';
      icon = Icons.schedule;
    } else if (daysUntil <= 30) {
      bg = AppTheme.primaryIndigo50;
      fg = AppTheme.primaryIndigo;
      label = '${daysUntil}d';
      icon = Icons.calendar_month;
    } else {
      bg = Colors.grey.shade100;
      fg = Colors.grey.shade700;
      label = '${daysUntil}d';
      icon = Icons.calendar_month;
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
            child: Icon(Icons.cloud_off, size: 30, color: Colors.red.shade400),
          ),
          const SizedBox(height: 14),
          const Text('Something went wrong',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground)),
          const SizedBox(height: 4),
          Text(_error ?? 'Error',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
              textAlign: TextAlign.center),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: _fetch,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              backgroundColor: _pink,
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
            decoration: const BoxDecoration(
              color: _pinkBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.cake_outlined, size: 32, color: _pink),
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
                foregroundColor: _pink,
                side: const BorderSide(color: _pink),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
