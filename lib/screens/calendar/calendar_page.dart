import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:anki_clone/services/http_service.dart';
import 'package:anki_clone/theme/app_theme.dart';
import 'package:anki_clone/utils/access_control.dart';

class CalendarPage extends StatefulWidget {
  final String role;
  const CalendarPage({super.key, required this.role});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  // ── State ──────────────────────────────────────────────────────────────
  DateTime _focusedMonth = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime _selectedDate = DateTime(
    DateTime.now().year,
    DateTime.now().month,
    DateTime.now().day,
  );

  bool _loadingEvents = true;
  bool _loadingSync = false;
  bool _syncing = false;
  String? _errorMessage;

  // Events keyed by "yyyy-MM-dd"
  final Map<String, List<Map<String, dynamic>>> _eventsByDate = {};
  List<Map<String, dynamic>> _allEvents = [];

  // Google sync status
  bool _isGoogleConnected = false;
  String? _lastSyncTime;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([
      _fetchEvents(),
      _fetchSyncStatus(),
    ]);
  }

  // ── Data fetching ──────────────────────────────────────────────────────

  Future<void> _fetchEvents() async {
    setState(() {
      _loadingEvents = true;
      _errorMessage = null;
    });

    try {
      final results = await Future.wait([
        HttpService.get('/api/google/events'),
        HttpService.get('/api/tour-programs/upcoming'),
      ]);

      final googleRes = results[0];
      final tourRes = results[1];

      final List<Map<String, dynamic>> combined = [];

      // Parse google/events response (tours + custom events)
      if (googleRes.statusCode == 200) {
        final decoded = jsonDecode(googleRes.body);
        final List items = decoded is List ? decoded : (decoded['data'] ?? decoded['events'] ?? []);
        for (final item in items) {
          combined.add({
            ...Map<String, dynamic>.from(item),
            '_source': item['type'] == 'tour' ? 'tour' : 'custom',
          });
        }
      }

      // Parse tour-programs/upcoming response
      if (tourRes.statusCode == 200) {
        final decoded = jsonDecode(tourRes.body);
        final List items = decoded is List ? decoded : (decoded['data'] ?? []);
        for (final item in items) {
          final map = Map<String, dynamic>.from(item);
          // Avoid duplicates if same tour appears in both endpoints
          final tourId = map['id']?.toString();
          final alreadyExists = combined.any(
            (e) => e['tourProgramId']?.toString() == tourId || e['id']?.toString() == tourId && e['_source'] == 'tour',
          );
          if (!alreadyExists) {
            combined.add({
              ...map,
              '_source': 'tour',
              'title': map['title'] ?? map['purpose'] ?? 'Tour Program',
              'start': map['startDate'] ?? map['date'] ?? map['createdAt'],
              'end': map['endDate'] ?? map['startDate'] ?? map['date'],
            });
          }
        }
      }

      // Index events by date
      final Map<String, List<Map<String, dynamic>>> indexed = {};
      for (final event in combined) {
        final startStr = event['start'] ?? event['startDate'] ?? event['date'] ?? '';
        if (startStr.toString().isEmpty) continue;

        final startDate = DateTime.tryParse(startStr.toString());
        if (startDate == null) continue;

        final endStr = event['end'] ?? event['endDate'] ?? startStr;
        final endDate = DateTime.tryParse(endStr.toString()) ?? startDate;

        // Add event to each day it spans
        var current = DateTime(startDate.year, startDate.month, startDate.day);
        final last = DateTime(endDate.year, endDate.month, endDate.day);
        while (!current.isAfter(last)) {
          final key = DateFormat('yyyy-MM-dd').format(current);
          indexed.putIfAbsent(key, () => []);
          indexed[key]!.add(event);
          current = current.add(const Duration(days: 1));
        }
      }

      setState(() {
        _allEvents = combined;
        _eventsByDate.clear();
        _eventsByDate.addAll(indexed);
        _loadingEvents = false;
      });
    } catch (e) {
      setState(() {
        _loadingEvents = false;
        _errorMessage = 'Failed to load events. Pull to refresh.';
      });
    }
  }

  Future<void> _fetchSyncStatus() async {
    setState(() => _loadingSync = true);
    try {
      final res = await HttpService.get('/api/google/status');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _isGoogleConnected = data['connected'] == true;
          _lastSyncTime = data['lastSync']?.toString();
          _loadingSync = false;
        });
      } else {
        setState(() => _loadingSync = false);
      }
    } catch (_) {
      setState(() => _loadingSync = false);
    }
  }

  Future<void> _syncCalendar() async {
    setState(() => _syncing = true);
    try {
      final res = await HttpService.post('/api/google/sync', {});
      if (res.statusCode == 200) {
        _showSnackBar('Calendar synced successfully', isError: false);
        await Future.wait([_fetchEvents(), _fetchSyncStatus()]);
      } else {
        final data = jsonDecode(res.body);
        _showSnackBar(data['message'] ?? 'Sync failed');
      }
    } catch (_) {
      _showSnackBar('Sync failed. Please try again.');
    } finally {
      setState(() => _syncing = false);
    }
  }

  Future<void> _deleteEvent(String eventId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        ),
        title: const Text('Delete Event'),
        content: const Text('Are you sure you want to delete this event?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: AppTheme.muted)),
          ),
          ElevatedButton(
            style: AppTheme.destructiveButton(),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final res = await HttpService.delete('/api/google/events/$eventId');
      if (res.statusCode == 200) {
        _showSnackBar('Event deleted', isError: false);
        await _fetchEvents();
      } else {
        final data = jsonDecode(res.body);
        _showSnackBar(data['message'] ?? 'Failed to delete event');
      }
    } catch (_) {
      _showSnackBar('Failed to delete event');
    }
  }

  // ── Add event bottom sheet ─────────────────────────────────────────────

  void _showAddEventSheet() {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    TimeOfDay selectedTime = TimeOfDay.now();
    DateTime selectedDate = _selectedDate;
    final formKey = GlobalKey<FormState>();
    bool submitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            decoration: const BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(AppTheme.radius2xl),
              ),
            ),
            padding: EdgeInsets.only(
              left: AppTheme.spacingLg,
              right: AppTheme.spacingLg,
              top: AppTheme.spacingLg,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + AppTheme.spacingLg,
            ),
            child: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Handle bar
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: AppTheme.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Text('Add Event', style: AppTheme.headingMd),
                    const SizedBox(height: AppTheme.spacingLg),

                    // Title
                    TextFormField(
                      controller: titleCtrl,
                      decoration: AppTheme.inputFieldDecoration(
                        label: 'Event Title',
                        hint: 'Enter event title',
                        prefixIcon: Icons.event,
                      ),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? 'Title is required' : null,
                    ),
                    const SizedBox(height: AppTheme.spacingMd),

                    // Date picker
                    InkWell(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: selectedDate,
                          firstDate: DateTime.now().subtract(const Duration(days: 30)),
                          lastDate: DateTime.now().add(const Duration(days: 365)),
                          builder: (context, child) {
                            return Theme(
                              data: Theme.of(context).copyWith(
                                colorScheme: const ColorScheme.light(
                                  primary: AppTheme.primaryIndigo,
                                ),
                              ),
                              child: child!,
                            );
                          },
                        );
                        if (picked != null) {
                          setSheetState(() => selectedDate = picked);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        decoration: AppTheme.inputDecoration(),
                        child: Row(
                          children: [
                            Icon(Icons.calendar_today,
                                size: 20, color: AppTheme.muted),
                            const SizedBox(width: 12),
                            Text(
                              DateFormat('EEE, dd MMM yyyy').format(selectedDate),
                              style: AppTheme.bodyMd,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),

                    // Time picker
                    InkWell(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      onTap: () async {
                        final picked = await showTimePicker(
                          context: ctx,
                          initialTime: selectedTime,
                          builder: (context, child) {
                            return Theme(
                              data: Theme.of(context).copyWith(
                                colorScheme: const ColorScheme.light(
                                  primary: AppTheme.primaryIndigo,
                                ),
                              ),
                              child: child!,
                            );
                          },
                        );
                        if (picked != null) {
                          setSheetState(() => selectedTime = picked);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        decoration: AppTheme.inputDecoration(),
                        child: Row(
                          children: [
                            Icon(Icons.access_time,
                                size: 20, color: AppTheme.muted),
                            const SizedBox(width: 12),
                            Text(
                              selectedTime.format(ctx),
                              style: AppTheme.bodyMd,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),

                    // Description
                    TextFormField(
                      controller: descCtrl,
                      maxLines: 3,
                      decoration: AppTheme.inputFieldDecoration(
                        label: 'Description',
                        hint: 'Optional description',
                        prefixIcon: Icons.notes,
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingXl),

                    // Submit button
                    ElevatedButton.icon(
                      style: AppTheme.primaryButton(),
                      onPressed: submitting
                          ? null
                          : () async {
                              if (!formKey.currentState!.validate()) return;
                              setSheetState(() => submitting = true);

                              final startDateTime = DateTime(
                                selectedDate.year,
                                selectedDate.month,
                                selectedDate.day,
                                selectedTime.hour,
                                selectedTime.minute,
                              );

                              try {
                                final res = await HttpService.post(
                                  '/api/google/events',
                                  {
                                    'title': titleCtrl.text.trim(),
                                    'description': descCtrl.text.trim(),
                                    'start': startDateTime.toIso8601String(),
                                    'end': startDateTime
                                        .add(const Duration(hours: 1))
                                        .toIso8601String(),
                                  },
                                );

                                if (res.statusCode == 200 ||
                                    res.statusCode == 201) {
                                  Navigator.pop(ctx);
                                  _showSnackBar('Event created', isError: false);
                                  await _fetchEvents();
                                } else {
                                  final data = jsonDecode(res.body);
                                  setSheetState(() => submitting = false);
                                  _showSnackBar(
                                    data['message'] ?? 'Failed to create event',
                                  );
                                }
                              } catch (_) {
                                setSheetState(() => submitting = false);
                                _showSnackBar('Failed to create event');
                              }
                            },
                      icon: submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.add, size: 20),
                      label: Text(submitting ? 'Creating...' : 'Create Event'),
                    ),
                    const SizedBox(height: AppTheme.spacingSm),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  void _showSnackBar(String msg, {bool isError = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? AppTheme.destructiveRed : AppTheme.successGreen,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        ),
      ),
    );
  }

  bool get _isAdmin =>
      widget.role == Roles.admin || widget.role == Roles.superAdmin;

  String _dateKey(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  List<Map<String, dynamic>> _eventsForDate(DateTime date) {
    return _eventsByDate[_dateKey(date)] ?? [];
  }


  // ── Calendar grid helpers ──────────────────────────────────────────────

  List<DateTime> _daysInMonthGrid(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final lastDay = DateTime(month.year, month.month + 1, 0);
    final daysInMonth = lastDay.day;

    // Monday = 1, Sunday = 7 → offset so Monday is column 0
    int startWeekday = first.weekday; // 1=Mon .. 7=Sun
    int leadingBlanks = startWeekday - 1; // days from previous month

    final List<DateTime> grid = [];

    // Leading days from previous month
    final prevMonth = DateTime(month.year, month.month, 0);
    for (int i = leadingBlanks - 1; i >= 0; i--) {
      grid.add(DateTime(prevMonth.year, prevMonth.month, prevMonth.day - i));
    }

    // Days of current month
    for (int d = 1; d <= daysInMonth; d++) {
      grid.add(DateTime(month.year, month.month, d));
    }

    // Trailing days to fill last row (always 6 rows = 42 cells)
    while (grid.length < 42) {
      final next = grid.last.add(const Duration(days: 1));
      grid.add(next);
    }

    return grid;
  }

  void _goToPreviousMonth() {
    setState(() {
      _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month - 1);
    });
  }

  void _goToNextMonth() {
    setState(() {
      _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month + 1);
    });
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _focusedMonth = DateTime(now.year, now.month);
      _selectedDate = DateTime(now.year, now.month, now.day);
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Calendar'),
        backgroundColor: AppTheme.primaryIndigo,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.today),
            tooltip: 'Go to Today',
            onPressed: _goToToday,
          ),
          if (_isAdmin)
            IconButton(
              icon: _syncing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sync),
              tooltip: 'Sync with Google Calendar',
              onPressed: _syncing ? null : _syncCalendar,
            ),
        ],
      ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton(
              backgroundColor: AppTheme.primaryIndigo,
              onPressed: _showAddEventSheet,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: RefreshIndicator(
        color: AppTheme.primaryIndigo,
        onRefresh: _loadAll,
        child: ListView(
          padding: const EdgeInsets.all(AppTheme.spacingLg),
          children: [
            // Sync status card (admin only)
            if (_isAdmin) _buildSyncStatusCard(),

            // Calendar header (month navigation)
            _buildMonthHeader(),

            const SizedBox(height: AppTheme.spacingSm),

            // Calendar grid
            _buildCalendarGrid(),

            const SizedBox(height: AppTheme.spacingLg),

            // Legend
            _buildLegend(),

            const SizedBox(height: AppTheme.spacingLg),

            // Events for selected date
            _buildSelectedDateEvents(),
          ],
        ),
      ),
    );
  }

  // ── Sync status card ───────────────────────────────────────────────────

  Widget _buildSyncStatusCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingLg),
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      decoration: AppTheme.cardDecoration(
        border: Border.all(
          color: _isGoogleConnected
              ? AppTheme.successGreen.withOpacity(0.3)
              : AppTheme.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: _isGoogleConnected
                  ? AppTheme.successGreen50
                  : AppTheme.backgroundAlt,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: Icon(
              _isGoogleConnected ? Icons.cloud_done : Icons.cloud_off,
              color: _isGoogleConnected
                  ? AppTheme.successGreen
                  : AppTheme.muted,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isGoogleConnected
                      ? 'Google Calendar Connected'
                      : 'Google Calendar Not Connected',
                  style: AppTheme.labelLg,
                ),
                if (_lastSyncTime != null)
                  Text(
                    'Last synced: ${_formatSyncTime(_lastSyncTime!)}',
                    style: AppTheme.bodySm,
                  ),
              ],
            ),
          ),
          if (_loadingSync)
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
        ],
      ),
    );
  }

  String _formatSyncTime(String isoString) {
    final dt = DateTime.tryParse(isoString);
    if (dt == null) return isoString;
    final local = dt.toLocal();
    final now = DateTime.now();
    final diff = now.difference(local);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return DateFormat('dd MMM, hh:mm a').format(local);
  }

  // ── Month header ───────────────────────────────────────────────────────

  Widget _buildMonthHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      decoration: AppTheme.cardDecoration(),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            color: AppTheme.primaryIndigo,
            onPressed: _goToPreviousMonth,
          ),
          Text(
            DateFormat('MMMM yyyy').format(_focusedMonth),
            style: AppTheme.headingSm.copyWith(
              color: AppTheme.primaryIndigo,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            color: AppTheme.primaryIndigo,
            onPressed: _goToNextMonth,
          ),
        ],
      ),
    );
  }

  // ── Calendar grid ──────────────────────────────────────────────────────

  Widget _buildCalendarGrid() {
    final days = _daysInMonthGrid(_focusedMonth);
    final today = DateTime.now();
    final todayKey = DateTime(today.year, today.month, today.day);
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return Container(
      decoration: AppTheme.cardDecoration(),
      padding: const EdgeInsets.all(AppTheme.spacingSm),
      child: Column(
        children: [
          // Weekday headers
          Row(
            children: weekDays
                .map(
                  (d) => Expanded(
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          d,
                          style: AppTheme.labelSm.copyWith(
                            fontWeight: FontWeight.w600,
                            color: d == 'Sun'
                                ? AppTheme.destructiveRed
                                : AppTheme.muted,
                          ),
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const Divider(height: 1, color: AppTheme.border),

          // Day cells in 6 rows of 7
          for (int row = 0; row < 6; row++)
            Row(
              children: List.generate(7, (col) {
                final index = row * 7 + col;
                final date = days[index];
                final isCurrentMonth = date.month == _focusedMonth.month;
                final isToday = date == todayKey;
                final isSelected = date == _selectedDate;
                final events = _eventsForDate(date);
                final isSunday = col == 6;

                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _selectedDate = date);
                    },
                    child: Container(
                      height: 48,
                      margin: const EdgeInsets.all(1),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppTheme.primaryIndigo
                            : isToday
                                ? AppTheme.primaryIndigo50
                                : Colors.transparent,
                        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            '${date.day}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isToday || isSelected
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                              color: isSelected
                                  ? Colors.white
                                  : !isCurrentMonth
                                      ? AppTheme.mutedForeground
                                          .withOpacity(0.4)
                                      : isSunday
                                          ? AppTheme.destructiveRed
                                          : AppTheme.foreground,
                            ),
                          ),
                          if (events.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: _buildEventDots(events, isSelected),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
        ],
      ),
    );
  }

  List<Widget> _buildEventDots(
    List<Map<String, dynamic>> events,
    bool isSelected,
  ) {
    // Show up to 3 dots
    final uniqueSources = <String>{};
    final dots = <Widget>[];

    for (final event in events) {
      final source = event['_source'] as String? ?? 'custom';
      if (uniqueSources.contains(source)) continue;
      uniqueSources.add(source);

      if (dots.length >= 3) break;

      final color = source == 'tour' ? AppTheme.saffron : AppTheme.primaryIndigo;
      dots.add(
        Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white : color,
            shape: BoxShape.circle,
          ),
        ),
      );
    }

    // If more events than dots, add an extra dot
    if (events.length > 3 && dots.length < 3) {
      dots.add(
        Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white70 : AppTheme.muted,
            shape: BoxShape.circle,
          ),
        ),
      );
    }

    return dots;
  }

  // ── Legend ──────────────────────────────────────────────────────────────

  Widget _buildLegend() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _legendItem(AppTheme.saffron, 'Tour Program'),
        const SizedBox(width: AppTheme.spacingXl),
        _legendItem(AppTheme.primaryIndigo, 'Custom Event'),
      ],
    );
  }

  Widget _legendItem(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(label, style: AppTheme.bodySm),
      ],
    );
  }

  // ── Selected date events ───────────────────────────────────────────────

  Widget _buildSelectedDateEvents() {
    final events = _eventsForDate(_selectedDate);
    final formattedDate = DateFormat('EEEE, dd MMMM yyyy').format(_selectedDate);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(formattedDate, style: AppTheme.headingSm),
        const SizedBox(height: AppTheme.spacingSm),

        if (_loadingEvents)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(color: AppTheme.primaryIndigo),
            ),
          )
        else if (_errorMessage != null)
          _buildEmptyState(
            icon: Icons.error_outline,
            message: _errorMessage!,
            color: AppTheme.destructiveRed,
          )
        else if (events.isEmpty)
          _buildEmptyState(
            icon: Icons.event_available,
            message: 'No events on this day',
            color: AppTheme.muted,
          )
        else
          ...events.map((event) => _buildEventCard(event)),
      ],
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String message,
    required Color color,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(icon, size: 48, color: color.withOpacity(0.5)),
          const SizedBox(height: 12),
          Text(
            message,
            style: AppTheme.bodyMd.copyWith(color: color),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildEventCard(Map<String, dynamic> event) {
    final source = event['_source'] as String? ?? 'custom';
    final isTour = source == 'tour';
    final accentColor = isTour ? AppTheme.saffron : AppTheme.primaryIndigo;
    final title = event['title'] ?? event['summary'] ?? 'Untitled Event';
    final description = event['description'] ?? event['purpose'] ?? '';
    final startStr = event['start'] ?? event['startDate'] ?? '';
    final eventId = event['id']?.toString();
    final isCustom = source == 'custom';

    String timeStr = '';
    if (startStr.toString().isNotEmpty) {
      final dt = DateTime.tryParse(startStr.toString());
      if (dt != null) {
        timeStr = DateFormat('hh:mm a').format(dt.toLocal());
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      decoration: AppTheme.cardDecoration(
        border: Border(
          left: BorderSide(color: accentColor, width: 4),
        ),
        radius: AppTheme.radiusMd,
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
            // Type icon
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: accentColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: Icon(
                isTour ? Icons.flight_takeoff : Icons.event,
                color: accentColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title.toString(), style: AppTheme.labelLg),
                  if (timeStr.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        children: [
                          Icon(Icons.access_time,
                              size: 14, color: AppTheme.muted),
                          const SizedBox(width: 4),
                          Text(timeStr, style: AppTheme.bodySm),
                        ],
                      ),
                    ),
                  if (description.toString().isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        description.toString(),
                        style: AppTheme.bodySm,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  // Source chip
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: accentColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        isTour ? 'Tour' : 'Event',
                        style: AppTheme.labelSm.copyWith(color: accentColor),
                      ),
                    ),
                  ),
                ],
              ),
            ),
              ],
            ),
            // Delete button for admin on custom events — own right-aligned row
            if (_isAdmin && isCustom && eventId != null) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  icon: const Icon(Icons.delete_outline, size: 20),
                  color: AppTheme.destructiveRed,
                  tooltip: 'Delete event',
                  onPressed: () => _deleteEvent(eventId),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
