import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import 'package:anki_clone/services/http_service.dart';
import 'package:anki_clone/theme/app_theme.dart';
import 'package:anki_clone/utils/access_control.dart';
import 'package:anki_clone/widgets/cupertino/cupertino_toast.dart';

class CupertinoCalendarPage extends StatefulWidget {
  final String role;
  const CupertinoCalendarPage({super.key, required this.role});

  @override
  State<CupertinoCalendarPage> createState() => _CupertinoCalendarPageState();
}

class _CupertinoCalendarPageState extends State<CupertinoCalendarPage> {
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

  final Map<String, List<Map<String, dynamic>>> _eventsByDate = {};

  bool _isGoogleConnected = false;
  String? _lastSyncTime;

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

      if (googleRes.statusCode == 200) {
        final decoded = jsonDecode(googleRes.body);
        final List items = decoded is List
            ? decoded
            : (decoded['data'] ?? decoded['events'] ?? []);
        for (final item in items) {
          combined.add({
            ...Map<String, dynamic>.from(item),
            '_source': item['type'] == 'tour' ? 'tour' : 'custom',
          });
        }
      }

      if (tourRes.statusCode == 200) {
        final decoded = jsonDecode(tourRes.body);
        final List items =
            decoded is List ? decoded : (decoded['data'] ?? []);
        for (final item in items) {
          final map = Map<String, dynamic>.from(item);
          final tourId = map['id']?.toString();
          final alreadyExists = combined.any(
            (e) =>
                e['tourProgramId']?.toString() == tourId ||
                (e['id']?.toString() == tourId && e['_source'] == 'tour'),
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

      final Map<String, List<Map<String, dynamic>>> indexed = {};
      for (final event in combined) {
        final startStr =
            event['start'] ?? event['startDate'] ?? event['date'] ?? '';
        if (startStr.toString().isEmpty) continue;

        final startDate = DateTime.tryParse(startStr.toString());
        if (startDate == null) continue;

        final endStr = event['end'] ?? event['endDate'] ?? startStr;
        final endDate = DateTime.tryParse(endStr.toString()) ?? startDate;

        var current = DateTime(startDate.year, startDate.month, startDate.day);
        final last = DateTime(endDate.year, endDate.month, endDate.day);
        while (!current.isAfter(last)) {
          final key = DateFormat('yyyy-MM-dd').format(current);
          indexed.putIfAbsent(key, () => []);
          indexed[key]!.add(event);
          current = current.add(const Duration(days: 1));
        }
      }

      if (!mounted) return;
      setState(() {
        _eventsByDate.clear();
        _eventsByDate.addAll(indexed);
        _loadingEvents = false;
      });
    } catch (_) {
      if (!mounted) return;
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
      if (!mounted) return;
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
      if (mounted) setState(() => _loadingSync = false);
    }
  }

  Future<void> _syncCalendar() async {
    setState(() => _syncing = true);
    try {
      final res = await HttpService.post('/api/google/sync', {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context, 'Calendar synced successfully');
        await Future.wait([_fetchEvents(), _fetchSyncStatus()]);
      } else {
        final data = jsonDecode(res.body);
        CupertinoToast.show(
          context,
          data['message'] ?? 'Sync failed',
          isError: true,
        );
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(
          context,
          'Sync failed. Please try again.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _deleteEvent(String eventId) async {
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Delete Event'),
        content: const Text('Are you sure you want to delete this event?'),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final res = await HttpService.delete('/api/google/events/$eventId');
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context, 'Event deleted');
        await _fetchEvents();
      } else {
        final data = jsonDecode(res.body);
        CupertinoToast.show(
          context,
          data['message'] ?? 'Failed to delete event',
          isError: true,
        );
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, 'Failed to delete event', isError: true);
      }
    }
  }

  void _showAddEventSheet() {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    DateTime selectedDateTime = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      DateTime.now().hour,
      DateTime.now().minute,
    );
    bool submitting = false;
    String? errorText;

    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            decoration: const BoxDecoration(
              color: AppTheme.surface,
              borderRadius:
                  BorderRadius.vertical(top: Radius.circular(AppTheme.radius2xl)),
            ),
            padding: EdgeInsets.only(
              left: AppTheme.spacingLg,
              right: AppTheme.spacingLg,
              top: AppTheme.spacingLg,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + AppTheme.spacingLg,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
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
                  const Text(
                    'Add Event',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingLg),
                  CupertinoTextField(
                    controller: titleCtrl,
                    placeholder: 'Event title',
                    prefix: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 10),
                      child: Icon(CupertinoIcons.calendar,
                          size: 18, color: AppTheme.muted),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      border: Border.all(color: AppTheme.border),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),
                  Container(
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      border: Border.all(color: AppTheme.border),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          DateFormat('EEE, dd MMM yyyy · hh:mm a')
                              .format(selectedDateTime),
                          style: const TextStyle(
                              fontSize: 13, color: AppTheme.muted),
                        ),
                        SizedBox(
                          height: 160,
                          child: CupertinoDatePicker(
                            mode: CupertinoDatePickerMode.dateAndTime,
                            initialDateTime: selectedDateTime,
                            minimumDate: DateTime.now()
                                .subtract(const Duration(days: 30)),
                            maximumDate: DateTime.now()
                                .add(const Duration(days: 365)),
                            onDateTimeChanged: (d) {
                              setSheetState(() => selectedDateTime = d);
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),
                  CupertinoTextField(
                    controller: descCtrl,
                    placeholder: 'Description (optional)',
                    maxLines: 3,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      border: Border.all(color: AppTheme.border),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                    ),
                  ),
                  if (errorText != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      errorText!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.destructiveRed,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppTheme.spacingXl),
                  CupertinoButton.filled(
                    onPressed: submitting
                        ? null
                        : () async {
                            if (titleCtrl.text.trim().isEmpty) {
                              setSheetState(() =>
                                  errorText = 'Title is required');
                              return;
                            }
                            setSheetState(() {
                              submitting = true;
                              errorText = null;
                            });

                            try {
                              final res = await HttpService.post(
                                '/api/google/events',
                                {
                                  'title': titleCtrl.text.trim(),
                                  'description': descCtrl.text.trim(),
                                  'start': selectedDateTime
                                      .toIso8601String(),
                                  'end': selectedDateTime
                                      .add(const Duration(hours: 1))
                                      .toIso8601String(),
                                },
                              );

                              if (res.statusCode == 200 ||
                                  res.statusCode == 201) {
                                Navigator.pop(ctx);
                                if (mounted) {
                                  CupertinoToast.show(
                                      context, 'Event created');
                                }
                                await _fetchEvents();
                              } else {
                                final data = jsonDecode(res.body);
                                setSheetState(() {
                                  submitting = false;
                                  errorText = data['message'] ??
                                      'Failed to create event';
                                });
                              }
                            } catch (_) {
                              setSheetState(() {
                                submitting = false;
                                errorText =
                                    'Failed to create event';
                              });
                            }
                          },
                    child: submitting
                        ? const CupertinoActivityIndicator(
                            color: CupertinoColors.white)
                        : const Text('Create Event'),
                  ),
                  const SizedBox(height: AppTheme.spacingSm),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  bool get _isAdmin =>
      widget.role == Roles.admin || widget.role == Roles.superAdmin;

  String _dateKey(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  List<Map<String, dynamic>> _eventsForDate(DateTime date) {
    return _eventsByDate[_dateKey(date)] ?? [];
  }

  List<DateTime> _daysInMonthGrid(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final lastDay = DateTime(month.year, month.month + 1, 0);
    final daysInMonth = lastDay.day;

    final int startWeekday = first.weekday;
    final int leadingBlanks = startWeekday - 1;

    final List<DateTime> grid = [];
    final prevMonth = DateTime(month.year, month.month, 0);
    for (int i = leadingBlanks - 1; i >= 0; i--) {
      grid.add(DateTime(prevMonth.year, prevMonth.month, prevMonth.day - i));
    }
    for (int d = 1; d <= daysInMonth; d++) {
      grid.add(DateTime(month.year, month.month, d));
    }
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

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text('Calendar'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              minSize: 32,
              onPressed: _goToToday,
              child: const Icon(CupertinoIcons.today, size: 22),
            ),
            if (_isAdmin)
              CupertinoButton(
                padding: EdgeInsets.zero,
                minSize: 32,
                onPressed: _syncing ? null : _syncCalendar,
                child: _syncing
                    ? const CupertinoActivityIndicator(radius: 10)
                    : const Icon(CupertinoIcons.refresh_thick, size: 20),
              ),
          ],
        ),
      ),
      child: SafeArea(
        child: Stack(
          children: [
            CustomScrollView(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _loadAll),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    AppTheme.spacingLg,
                    AppTheme.spacingLg,
                    AppTheme.spacingLg,
                    _isAdmin ? 96 : AppTheme.spacingLg,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      if (_isAdmin) _buildSyncStatusCard(),
                      _buildMonthHeader(),
                      const SizedBox(height: AppTheme.spacingSm),
                      _buildCalendarGrid(),
                      const SizedBox(height: AppTheme.spacingLg),
                      _buildLegend(),
                      const SizedBox(height: AppTheme.spacingLg),
                      _buildSelectedDateEvents(),
                    ]),
                  ),
                ),
              ],
            ),
            if (_isAdmin)
              Positioned(
                right: 16,
                bottom: 16,
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 14),
                  color: AppTheme.primaryIndigo,
                  borderRadius: BorderRadius.circular(28),
                  onPressed: _showAddEventSheet,
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.add,
                          color: CupertinoColors.white, size: 18),
                      SizedBox(width: 6),
                      Text('Add Event',
                          style: TextStyle(
                              color: CupertinoColors.white,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

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
              _isGoogleConnected
                  ? CupertinoIcons.cloud_fill
                  : CupertinoIcons.cloud,
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
          if (_loadingSync) const CupertinoActivityIndicator(radius: 10),
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
          CupertinoButton(
            padding: EdgeInsets.zero,
            minSize: 36,
            onPressed: _goToPreviousMonth,
            child: const Icon(CupertinoIcons.chevron_left,
                color: AppTheme.primaryIndigo),
          ),
          Text(
            DateFormat('MMMM yyyy').format(_focusedMonth),
            style: AppTheme.headingSm.copyWith(color: AppTheme.primaryIndigo),
          ),
          CupertinoButton(
            padding: EdgeInsets.zero,
            minSize: 36,
            onPressed: _goToNextMonth,
            child: const Icon(CupertinoIcons.chevron_right,
                color: AppTheme.primaryIndigo),
          ),
        ],
      ),
    );
  }

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
          Container(height: 1, color: AppTheme.border),
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
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _selectedDate = date),
                    child: Container(
                      height: 48,
                      margin: const EdgeInsets.all(1),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppTheme.primaryIndigo
                            : isToday
                                ? AppTheme.primaryIndigo50
                                : null,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusSm),
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
                                  ? CupertinoColors.white
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
            color: isSelected ? CupertinoColors.white : color,
            shape: BoxShape.circle,
          ),
        ),
      );
    }

    if (events.length > 3 && dots.length < 3) {
      dots.add(
        Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: BoxDecoration(
            color: isSelected
                ? CupertinoColors.white.withOpacity(0.7)
                : AppTheme.muted,
            shape: BoxShape.circle,
          ),
        ),
      );
    }

    return dots;
  }

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

  Widget _buildSelectedDateEvents() {
    final events = _eventsForDate(_selectedDate);
    final formattedDate =
        DateFormat('EEEE, dd MMMM yyyy').format(_selectedDate);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(formattedDate, style: AppTheme.headingSm),
        const SizedBox(height: AppTheme.spacingSm),
        if (_loadingEvents)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: CupertinoActivityIndicator(radius: 14),
            ),
          )
        else if (_errorMessage != null)
          _buildEmptyState(
            icon: CupertinoIcons.exclamationmark_circle,
            message: _errorMessage!,
            color: AppTheme.destructiveRed,
          )
        else if (events.isEmpty)
          _buildEmptyState(
            icon: CupertinoIcons.calendar_badge_minus,
            message: 'No events on this day',
            color: AppTheme.muted,
          )
        else
          ...events.map(_buildEventCard),
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
        border: Border(left: BorderSide(color: accentColor, width: 4)),
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
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: accentColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: Icon(
                isTour ? CupertinoIcons.airplane : CupertinoIcons.calendar,
                color: accentColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
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
                          const Icon(CupertinoIcons.time,
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
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
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
            if (_isAdmin && isCustom && eventId != null) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: CupertinoButton(
                  padding: EdgeInsets.zero,
                  minSize: 36,
                  onPressed: () => _deleteEvent(eventId),
                  child: const Icon(
                    CupertinoIcons.trash,
                    color: AppTheme.destructiveRed,
                    size: 20,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
