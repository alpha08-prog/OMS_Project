import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/attendance_service.dart';
import '../../theme/app_theme.dart';

/// Admin "Staff Attendance" — Day / Month / Year toggle.
///
/// - Day: per-staff rows for one date (PRESENT/HALF_DAY/LEAVE/ABSENT) with
///   filter pills.
/// - Month / Year: per-staff totals across the range, from `/attendance/aggregate`.
class StaffAttendancePage extends StatefulWidget {
  const StaffAttendancePage({super.key});

  @override
  State<StaffAttendancePage> createState() => _StaffAttendancePageState();
}

enum _RangeMode { day, month, year }

enum _StatusFilter { all, present, halfDay, leave, absent }

class _StaffAttendancePageState extends State<StaffAttendancePage> {
  _RangeMode _mode = _RangeMode.day;
  _StatusFilter _filter = _StatusFilter.all;

  DateTime _selectedDate = DateTime.now();

  bool _loading = true;
  List<AttendanceRecord> _dayRows = [];
  AttendanceAggregate? _aggregate;
  AttendanceStats? _todayStats;

  static final DateFormat _isoFmt = DateFormat('yyyy-MM-dd');
  static final DateFormat _displayDateFmt = DateFormat('dd-MM-yyyy');
  static final DateFormat _monthFmt = DateFormat('MMMM yyyy');
  static final DateFormat _yearFmt = DateFormat('yyyy');
  static final DateFormat _markedAtFmt = DateFormat('M/d/yyyy, h:mm:ss a');

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      if (_mode == _RangeMode.day) {
        final iso = _isoFmt.format(_selectedDate);
        final results = await Future.wait([
          AttendanceService.getAllForDate(iso),
          // Stats endpoint always returns *today's* totals — only meaningful
          // when the user is looking at today. For past dates we derive
          // counts from the per-row list.
          if (_isToday(_selectedDate))
            AttendanceService.getTodayStats()
          else
            Future.value(null),
        ]);
        final rows = results[0] as List<AttendanceRecord>;
        final stats = results[1] as AttendanceStats?;
        if (!mounted) return;
        setState(() {
          _dayRows = rows;
          _todayStats = stats ?? _deriveStats(rows, iso);
          _aggregate = null;
          _loading = false;
        });
      } else {
        final (start, end) = _rangeForMode();
        final agg = await AttendanceService.getAggregate(
          startDate: start,
          endDate: end,
        );
        if (!mounted) return;
        setState(() {
          _aggregate = agg;
          _dayRows = [];
          _todayStats = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  bool _isToday(DateTime d) {
    final n = DateTime.now();
    return d.year == n.year && d.month == n.month && d.day == n.day;
  }

  AttendanceStats _deriveStats(List<AttendanceRecord> rows, String date) {
    int p = 0, h = 0, l = 0, a = 0;
    for (final r in rows) {
      switch (r.status) {
        case AttendanceStatus.present:
          p++;
          break;
        case AttendanceStatus.halfDay:
          h++;
          break;
        case AttendanceStatus.leave:
          l++;
          break;
        case AttendanceStatus.absent:
          a++;
          break;
      }
    }
    return AttendanceStats(
      date: date,
      totalStaff: rows.length,
      present: p,
      halfDay: h,
      leave: l,
      absent: a,
    );
  }

  (String, String) _rangeForMode() {
    if (_mode == _RangeMode.month) {
      final start = DateTime(_selectedDate.year, _selectedDate.month, 1);
      final end = DateTime(_selectedDate.year, _selectedDate.month + 1, 0);
      return (_isoFmt.format(start), _isoFmt.format(end));
    }
    // Year
    final start = DateTime(_selectedDate.year, 1, 1);
    final end = DateTime(_selectedDate.year, 12, 31);
    return (_isoFmt.format(start), _isoFmt.format(end));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Staff Attendance'),
        backgroundColor: AppTheme.primaryIndigo,
        foregroundColor: Colors.white,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildHeader(),
            const SizedBox(height: 16),
            _buildDatePickerCard(),
            const SizedBox(height: 16),
            if (_mode == _RangeMode.day) _buildStatsRow(),
            if (_mode == _RangeMode.day) const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_mode == _RangeMode.day)
              _buildDayTable()
            else
              _buildAggregateTable(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Staff Attendance',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryIndigo,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: AppTheme.backgroundAlt,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  _modeButton(_RangeMode.day, 'Day'),
                  _modeButton(_RangeMode.month, 'Month'),
                  _modeButton(_RangeMode.year, 'Year'),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Day view shows per-staff status with auto-absent. Month/Year views show per-staff totals across the range.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }

  Widget _modeButton(_RangeMode m, String label) {
    final selected = _mode == m;
    return GestureDetector(
      onTap: () {
        setState(() => _mode = m);
        _refresh();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primaryIndigo : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppTheme.foreground,
          ),
        ),
      ),
    );
  }

  Widget _buildDatePickerCard() {
    final (start, end) = _mode == _RangeMode.day
        ? (_isoFmt.format(_selectedDate), _isoFmt.format(_selectedDate))
        : _rangeForMode();

    String pickerLabel;
    switch (_mode) {
      case _RangeMode.day:
        pickerLabel = _displayDateFmt.format(_selectedDate);
        break;
      case _RangeMode.month:
        pickerLabel = _monthFmt.format(_selectedDate);
        break;
      case _RangeMode.year:
        pickerLabel = _yearFmt.format(_selectedDate);
        break;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Row(
        children: [
          const Text(
            'Date',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.muted),
          ),
          const SizedBox(width: 10),
          InkWell(
            onTap: _pickDate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  Text(
                    pickerLabel,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.foreground),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.calendar_today,
                      size: 14, color: AppTheme.muted),
                ],
              ),
            ),
          ),
          const Spacer(),
          Text(
            'Range: $start → $end',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
      _refresh();
    }
  }

  Widget _buildStatsRow() {
    final stats = _todayStats ?? AttendanceStats.empty();
    return Row(
      children: [
        _statTile('PRESENT', stats.present, AppTheme.successGreen),
        const SizedBox(width: 10),
        _statTile('HALF DAY', stats.halfDay, AppTheme.saffronDark),
        const SizedBox(width: 10),
        _statTile('LEAVE', stats.leave, AppTheme.primaryIndigo),
        const SizedBox(width: 10),
        _statTile('ABSENT', stats.absent, AppTheme.destructiveRed),
      ],
    );
  }

  Widget _statTile(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: color.withOpacity(0.3)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: color),
            ),
            const SizedBox(height: 8),
            Text(
              '$value',
              style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.foreground),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDayTable() {
    final filtered = _filter == _StatusFilter.all
        ? _dayRows
        : _dayRows
            .where((r) => r.status == _filterToStatus(_filter))
            .toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Staff Records — ${_isoFmt.format(_selectedDate)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: AppTheme.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _filterPill(_StatusFilter.all, 'ALL'),
                _filterPill(_StatusFilter.present, 'PRESENT'),
                _filterPill(_StatusFilter.halfDay, 'HALF DAY'),
                _filterPill(_StatusFilter.leave, 'LEAVE'),
                _filterPill(_StatusFilter.absent, 'ABSENT'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No matching records',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                ),
              ),
            )
          else
            Column(children: [for (final r in filtered) _dayRowTile(r)]),
        ],
      ),
    );
  }

  AttendanceStatus _filterToStatus(_StatusFilter f) {
    switch (f) {
      case _StatusFilter.present:
        return AttendanceStatus.present;
      case _StatusFilter.halfDay:
        return AttendanceStatus.halfDay;
      case _StatusFilter.leave:
        return AttendanceStatus.leave;
      case _StatusFilter.absent:
        return AttendanceStatus.absent;
      case _StatusFilter.all:
        return AttendanceStatus.absent; // unused
    }
  }

  Widget _filterPill(_StatusFilter f, String label) {
    final selected = _filter == f;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () => setState(() => _filter = f),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? AppTheme.saffron : AppTheme.backgroundAlt,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : AppTheme.foreground,
            ),
          ),
        ),
      ),
    );
  }

  Widget _dayRowTile(AttendanceRecord r) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              r.userName.isEmpty ? '—' : r.userName,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.foreground,
              ),
            ),
          ),
          SizedBox(width: 90, child: _statusPill(r.status, compact: true)),
          Expanded(
            flex: 2,
            child: Text(
              (r.reason ?? '').isEmpty ? '—' : r.reason!,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
          ),
          SizedBox(
            width: 120,
            child: Text(
              r.markedAt == null ? '—' : _formatMarkedAt(r.markedAt!),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAggregateTable() {
    final agg = _aggregate;
    if (agg == null || agg.staff.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 24),
        decoration: _cardDecoration(),
        child: Center(
          child: Text(
            'No data for selected range',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
          ),
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Staff Totals — ${agg.startDate} → ${agg.endDate}',
            style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 14,
                color: AppTheme.foreground),
          ),
          const SizedBox(height: 12),
          // Header row
          Row(
            children: [
              const Expanded(
                  flex: 3,
                  child: Text('Staff',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.muted))),
              SizedBox(
                  width: 50,
                  child: Center(
                      child: Text('P',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.successGreen)))),
              SizedBox(
                  width: 50,
                  child: Center(
                      child: Text('HD',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.saffronDark)))),
              SizedBox(
                  width: 50,
                  child: Center(
                      child: Text('L',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.primaryIndigo)))),
              SizedBox(
                  width: 60,
                  child: Center(
                      child: Text('Total',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.muted)))),
            ],
          ),
          const Divider(),
          for (final s in agg.staff)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(
                      s.userName.isEmpty ? '—' : s.userName,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.foreground),
                    ),
                  ),
                  SizedBox(
                      width: 50,
                      child: Center(
                          child: Text('${s.present}',
                              style: const TextStyle(fontSize: 13)))),
                  SizedBox(
                      width: 50,
                      child: Center(
                          child: Text('${s.halfDay}',
                              style: const TextStyle(fontSize: 13)))),
                  SizedBox(
                      width: 50,
                      child: Center(
                          child: Text('${s.leave}',
                              style: const TextStyle(fontSize: 13)))),
                  SizedBox(
                      width: 60,
                      child: Center(
                          child: Text('${s.totalMarked}',
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700)))),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _statusPill(AttendanceStatus? status, {bool compact = false}) {
    final (bg, fg, label) = _statusStyle(status);
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10, vertical: compact ? 3 : 5),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(
        label,
        style: TextStyle(
          fontSize: compact ? 10 : 11,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }

  (Color, Color, String) _statusStyle(AttendanceStatus? s) {
    switch (s) {
      case AttendanceStatus.present:
        return (AppTheme.successGreen100, AppTheme.successGreen, 'PRESENT');
      case AttendanceStatus.halfDay:
        return (AppTheme.warningAmber100, AppTheme.saffronDark, 'HALF DAY');
      case AttendanceStatus.leave:
        return (AppTheme.primaryIndigo100, AppTheme.primaryIndigo, 'LEAVE');
      case AttendanceStatus.absent:
        return (AppTheme.destructiveRed100, AppTheme.destructiveRed, 'ABSENT');
      case null:
        return (AppTheme.backgroundAlt, AppTheme.muted, '—');
    }
  }

  BoxDecoration _cardDecoration() => BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      );

  String _formatMarkedAt(String iso) {
    try {
      return _markedAtFmt.format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso;
    }
  }
}
