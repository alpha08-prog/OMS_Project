import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/meeting_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/oms_app_bar.dart';

/// Admin "Meetings" module — mirrors the web screen. Upcoming / Past / All
/// tabs, schedule a meeting, record a post-meeting summary, mark
/// completed/cancelled, and delete. Backed by /api/meetings.
class MeetingsPage extends StatefulWidget {
  const MeetingsPage({super.key});

  @override
  State<MeetingsPage> createState() => _MeetingsPageState();
}

class _MeetingsPageState extends State<MeetingsPage>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  bool _loading = true;
  List<Map<String, dynamic>> _meetings = [];

  DateTime? _dateFrom;
  DateTime? _dateTo;

  static const _scopes = ['upcoming', 'past', 'all'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _tab.addListener(() {
      if (!_tab.indexIsChanging) _fetch();
    });
    _fetch();
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final scope = _scopes[_tab.index];
    final meetings =
        await MeetingService.list(scope: scope == 'all' ? null : scope);
    if (!mounted) return;
    setState(() {
      _meetings = meetings;
      _loading = false;
    });
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'SCHEDULED':
        return AppTheme.primaryIndigo;
      case 'COMPLETED':
        return AppTheme.successGreen;
      case 'CANCELLED':
        return AppTheme.destructiveRed;
      default:
        return Colors.grey;
    }
  }

  String _fmtDateTime(dynamic v) {
    if (v == null) return '';
    try {
      return DateFormat('EEE, dd MMM yyyy · hh:mm a')
          .format(DateTime.parse(v.toString().replaceFirst(' ', 'T')));
    } catch (_) {
      return v.toString();
    }
  }

  List<Map<String, dynamic>> get _visibleMeetings {
    if (_dateFrom == null && _dateTo == null) return _meetings;
    return _meetings.where((m) {
      final dt = DateTime.tryParse(
          (m['dateTime']?.toString() ?? '').replaceFirst(' ', 'T'));
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'meetings',
      headers: const ['Title', 'Date/Time', 'Location', 'Attendees', 'Status'],
      rows: _visibleMeetings.map((m) {
        return [
          m['title'] ?? '',
          _fmtDateTime(m['dateTime']),
          m['location'] ?? '',
          m['attendees'] ?? '',
          m['status'] ?? '',
        ];
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: omsAppBar(
        context,
        title: 'Meetings',
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleMeetings.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetch,
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          indicatorColor: AppTheme.saffron,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'Past'),
            Tab(text: 'All'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppTheme.primaryIndigo,
        onPressed: () => _openForm(),
        icon: const Icon(Icons.add),
        label: const Text('Schedule'),
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            child: DateRangeFilter(
              from: _dateFrom,
              to: _dateTo,
              tint: AppTheme.primaryIndigo,
              onFromChanged: (d) => setState(() => _dateFrom = d),
              onToChanged: (d) => setState(() => _dateTo = d),
              onClear: () => setState(() {
                _dateFrom = null;
                _dateTo = null;
              }),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _visibleMeetings.isEmpty
                    ? _empty()
                    : RefreshIndicator(
                        onRefresh: _fetch,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
                          itemCount: _visibleMeetings.length,
                          itemBuilder: (_, i) => _card(_visibleMeetings[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _empty() => ListView(
        children: [
          const SizedBox(height: 140),
          Icon(Icons.groups_2_outlined, size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Center(
            child: Text('No meetings here yet',
                style: TextStyle(color: Colors.grey.shade500)),
          ),
        ],
      );

  Widget _card(Map<String, dynamic> m) {
    final status = m['status']?.toString() ?? 'SCHEDULED';
    final location = m['location']?.toString();
    final attendees = m['attendees']?.toString();
    final summary = m['summary']?.toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(m['title']?.toString() ?? '-',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(status).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(status,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: _statusColor(status))),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _line(Icons.schedule, _fmtDateTime(m['dateTime'])),
          if (location != null && location.isNotEmpty)
            _line(Icons.location_on_outlined, location),
          if (attendees != null && attendees.isNotEmpty)
            _line(Icons.people_outline, attendees),
          if (m['agenda']?.toString().isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(m['agenda'],
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
          ],
          if (summary != null && summary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.successGreen50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Summary',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.successGreen)),
                  const SizedBox(height: 2),
                  Text(summary, style: const TextStyle(fontSize: 13)),
                ],
              ),
            ),
          ],
          const Divider(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (status == 'SCHEDULED')
                TextButton.icon(
                  onPressed: () => _setStatus(m, 'COMPLETED'),
                  icon: const Icon(Icons.check_circle_outline, size: 16),
                  label: const Text('Complete', style: TextStyle(fontSize: 12)),
                  style:
                      TextButton.styleFrom(foregroundColor: AppTheme.successGreen),
                ),
              TextButton.icon(
                onPressed: () => _openForm(existing: m),
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Edit', style: TextStyle(fontSize: 12)),
              ),
              IconButton(
                onPressed: () => _confirmDelete(m),
                icon: const Icon(Icons.delete_outline, size: 18),
                color: AppTheme.destructiveRed,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 15, color: Colors.grey.shade500),
            const SizedBox(width: 6),
            Expanded(
              child: Text(text,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ),
          ],
        ),
      );

  Future<void> _setStatus(Map<String, dynamic> m, String status) async {
    final res = await MeetingService.update(m['id'].toString(), {'status': status});
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message)));
    if (res.ok) _fetch();
  }

  Future<void> _confirmDelete(Map<String, dynamic> m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete meeting?'),
        content: Text('"${m['title']}" will be removed.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppTheme.destructiveRed),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final res = await MeetingService.delete(m['id'].toString());
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message)));
    if (res.ok) _fetch();
  }

  Future<void> _openForm({Map<String, dynamic>? existing}) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _MeetingForm(existing: existing),
    );
    if (changed == true) _fetch();
  }
}

/// Schedule / edit form as a bottom sheet.
class _MeetingForm extends StatefulWidget {
  final Map<String, dynamic>? existing;
  const _MeetingForm({this.existing});

  @override
  State<_MeetingForm> createState() => _MeetingFormState();
}

class _MeetingFormState extends State<_MeetingForm> {
  final _title = TextEditingController();
  final _location = TextEditingController();
  final _attendees = TextEditingController();
  final _agenda = TextEditingController();
  final _summary = TextEditingController();
  DateTime? _dateTime;
  String _status = 'SCHEDULED';
  bool _submitting = false;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _title.text = e['title']?.toString() ?? '';
      _location.text = e['location']?.toString() ?? '';
      _attendees.text = e['attendees']?.toString() ?? '';
      _agenda.text = e['agenda']?.toString() ?? '';
      _summary.text = e['summary']?.toString() ?? '';
      _status = e['status']?.toString() ?? 'SCHEDULED';
      try {
        _dateTime =
            DateTime.parse(e['dateTime'].toString().replaceFirst(' ', 'T'));
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _attendees.dispose();
    _agenda.dispose();
    _summary.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _dateTime ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_dateTime ?? now),
    );
    if (time == null) return;
    setState(() {
      _dateTime =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty || _dateTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title and date/time are required')),
      );
      return;
    }
    setState(() => _submitting = true);
    final iso = _dateTime!.toIso8601String();
    late final ({bool ok, String message}) res;
    if (_isEdit) {
      res = await MeetingService.update(widget.existing!['id'].toString(), {
        'title': _title.text.trim(),
        'dateTime': iso,
        'status': _status,
        'location': _location.text.trim(),
        'attendees': _attendees.text.trim(),
        'agenda': _agenda.text.trim(),
        'summary': _summary.text.trim(),
      });
    } else {
      res = await MeetingService.create(
        title: _title.text.trim(),
        dateTime: iso,
        location: _location.text,
        attendees: _attendees.text,
        agenda: _agenda.text,
        summary: _summary.text,
      );
    }
    if (!mounted) return;
    setState(() => _submitting = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message)));
    if (res.ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final dtLabel = _dateTime == null
        ? 'Pick date & time'
        : DateFormat('EEE, dd MMM yyyy · hh:mm a').format(_dateTime!);
    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Text(_isEdit ? 'Edit Meeting' : 'Schedule Meeting',
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _field(_title, 'Title *'),
            const SizedBox(height: 12),
            InkWell(
              onTap: _pickDateTime,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Date & Time *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.schedule),
                ),
                child: Text(dtLabel),
              ),
            ),
            const SizedBox(height: 12),
            _field(_location, 'Location'),
            const SizedBox(height: 12),
            _field(_attendees, 'Attendees (comma-separated)'),
            const SizedBox(height: 12),
            _field(_agenda, 'Agenda', maxLines: 3),
            if (_isEdit) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _status,
                decoration: const InputDecoration(
                    labelText: 'Status', border: OutlineInputBorder()),
                items: const ['SCHEDULED', 'COMPLETED', 'CANCELLED']
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => setState(() => _status = v!),
              ),
              const SizedBox(height: 12),
              _field(_summary, 'Summary (post-meeting notes)', maxLines: 3),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: AppTheme.primaryButton(),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(_isEdit ? 'Save Changes' : 'Schedule Meeting',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {int maxLines = 1}) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      );
}
