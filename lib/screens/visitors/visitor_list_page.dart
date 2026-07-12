import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/access_control.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

class VisitorListPage extends StatefulWidget {
  final String role;
  const VisitorListPage({super.key, required this.role});

  @override
  State<VisitorListPage> createState() => _VisitorListPageState();
}

class _VisitorListPageState extends State<VisitorListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  static const LinearGradient _blueGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryBlue, Color(0xFF1E4E8C)],
  );

  // Filter option lists — kept in sync with the web "Visitor Log" filters and
  // the Log Visitor form (constituencies mirror constituencies.ts).
  static const List<String> _designations = [
    'Party Worker',
    'Official',
    'Public',
    'Business',
    'Media',
    'Family',
    'VIP',
    'Supporter',
    'Other',
  ];

  static const List<String> _constituencies = [
    'Navalagund 69',
    'Kundagol 70',
    'Dharwad 71',
    'Hubli-Dharwad East 72',
    'Hubli-Dharwad Central 73',
    'Dharwad West 74',
    'Kalaghatagi 75',
    'Shiggaon 83',
    'Out of Constituency',
  ];

  bool loading = true;
  String? error;

  final TextEditingController _searchCtrl = TextEditingController();
  String _search = '';
  String _designationFilter = 'All';
  String _constituencyFilter = 'All';
  DateTime? _dateFilter;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> visitors = [];

  @override
  void initState() {
    super.initState();
    fetchVisitors();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  Future<void> fetchVisitors() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final res = await HttpService.get("/api/visitors");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          visitors = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
      } else {
        setState(() {
          error = "Failed to load visitors (${res.statusCode})";
          loading = false;
        });
      }
    } catch (_) {
      setState(() {
        error = "Server error / No internet";
        loading = false;
      });
    }
  }

  // ── Date helpers ─────────────────────────────────────────────────────────

  DateTime? _parse(dynamic raw) {
    if (raw == null) return null;
    final s = raw.toString().trim();
    if (s.isEmpty) return null;
    final dt = DateTime.tryParse(s);
    if (dt != null) return dt;
    final ms = int.tryParse(s);
    if (ms != null) return DateTime.fromMillisecondsSinceEpoch(ms);
    return null;
  }

  /// Primary date of a visit: visitDate, falling back to createdAt.
  DateTime? _dateOf(Map<String, dynamic> v) =>
      _parse(v['visitDate']) ?? _parse(v['createdAt']);

  String _rawDate(Map<String, dynamic> v) =>
      (v['visitDate'] ?? v['createdAt'] ?? '-').toString();

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  // ── Stats (computed from ALL visitors) ───────────────────────────────────

  int get _totalCount => visitors.length;

  int get _todayCount {
    final now = DateTime.now();
    return visitors.where((v) {
      final dt = _dateOf(v);
      return dt != null && _sameDay(dt, now);
    }).length;
  }

  int get _partyWorkerCount => visitors
      .where((v) => (v['designation'] ?? '').toString() == 'Party Worker')
      .length;

  // ── Filtering ────────────────────────────────────────────────────────────

  List<Map<String, dynamic>> get _filtered {
    return visitors.where((v) {
      if (_designationFilter != 'All' &&
          (v['designation'] ?? '').toString() != _designationFilter) {
        return false;
      }
      if (_constituencyFilter != 'All' &&
          (v['constituency'] ?? '').toString() != _constituencyFilter) {
        return false;
      }
      if (_search.isNotEmpty) {
        final q = _search.toLowerCase();
        final name = (v['name'] ?? '').toString().toLowerCase();
        final purpose = (v['purpose'] ?? '').toString().toLowerCase();
        if (!name.contains(q) && !purpose.contains(q)) return false;
      }
      if (_dateFilter != null) {
        final dt = _dateOf(v);
        if (dt == null || !_sameDay(dt, _dateFilter!)) return false;
      }
      if (_dateFrom != null || _dateTo != null) {
        if (!dateInRange(_dateOf(v), from: _dateFrom, to: _dateTo)) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  void _applySearch() {
    setState(() => _search = _searchCtrl.text.trim());
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateFilter ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _dateFilter = picked);
  }

  Future<void> _exportCsv() async {
    final rows = _filtered.map((v) {
      final dt = _dateOf(v);
      final dateStr = dt != null
          ? DateFormat('dd MMM yyyy').format(dt)
          : _rawDate(v);
      return [
        v['name'] ?? '',
        v['designation'] ?? '',
        v['phone'] ?? '',
        dateStr,
        v['constituency'] ?? '',
        v['wardVillage'] ?? '',
        v['purpose'] ?? '',
        v['referencedBy'] ?? '',
      ];
    }).toList();

    await CsvExport.export(
      context,
      fileName: 'visitors',
      headers: const [
        'Name',
        'Designation',
        'Phone',
        'Date',
        'Constituency',
        'Ward',
        'Purpose',
        'Referenced By',
      ],
      rows: rows,
    );
  }

  // ── Create (preserved bottom sheet) ──────────────────────────────────────

  void _openAddVisitor() {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _AddVisitorSheet(
        onCreated: () async {
          Navigator.pop(context);
          await fetchVisitors();
        },
      ),
    );
  }

  Future<void> _deleteVisitor(String id) async {
    final canDelete = widget.role == Roles.admin; // only admin delete
    if (!canDelete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can delete.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete Visitor"),
        content: const Text("Are you sure you want to delete this visitor?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text("Cancel")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Delete", style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/visitors/$id");
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Deleted")),
        );
        fetchVisitors();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Delete failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final canCreate = widget.role != Roles.admin &&
        AccessControl.can(widget.role, ActionPermission.create);

    final filtered = _filtered;

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Visitor Log"),
        backgroundColor: primaryBlue,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: fetchVisitors,
          )
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: primaryBlue,
              onPressed: _openAddVisitor,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : RefreshIndicator(
                  onRefresh: fetchVisitors,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildStatsRow(),
                      const SizedBox(height: 16),
                      _buildFilters(),
                      const SizedBox(height: 12),
                      DateRangeFilter(
                        from: _dateFrom,
                        to: _dateTo,
                        tint: primaryBlue,
                        padding: EdgeInsets.zero,
                        onFromChanged: (d) => setState(() => _dateFrom = d),
                        onToChanged: (d) => setState(() => _dateTo = d),
                        onClear: () => setState(() {
                          _dateFrom = null;
                          _dateTo = null;
                        }),
                      ),
                      const SizedBox(height: 12),
                      _buildResultCount(filtered.length),
                      const SizedBox(height: 8),
                      if (filtered.isEmpty)
                        _buildEmptyState()
                      else
                        ...filtered.map(_buildVisitorCard),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        _statTile("Total Visitors", _totalCount, Icons.people, _blueGradient),
        const SizedBox(width: 10),
        _statTile("Today's Visitors", _todayCount, Icons.today,
            AppTheme.saffronGradient),
        const SizedBox(width: 10),
        _statTile("Party Workers", _partyWorkerCount, Icons.groups,
            AppTheme.successGradient),
      ],
    );
  }

  Widget _statTile(String label, int count, IconData icon, Gradient gradient) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: Colors.white.withOpacity(0.9), size: 20),
            const SizedBox(height: 8),
            Text(
              count.toString(),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10.5,
                color: Colors.white.withOpacity(0.9),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Column(
      children: [
        // Search + Search button
        Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(color: AppTheme.border),
                ),
                child: TextField(
                  controller: _searchCtrl,
                  onSubmitted: (_) => _applySearch(),
                  decoration: InputDecoration(
                    hintText: "Search by name or purpose",
                    hintStyle:
                        AppTheme.bodySm.copyWith(color: AppTheme.mutedForeground),
                    prefixIcon: const Icon(Icons.search,
                        color: AppTheme.muted, size: 20),
                    suffixIcon: _search.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchCtrl.clear();
                              setState(() => _search = '');
                            },
                          )
                        : null,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 46,
              child: ElevatedButton(
                onPressed: _applySearch,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryBlue,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                ),
                child: const Text("Search"),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // Designation + Constituency dropdowns
        Row(
          children: [
            Expanded(
              child: _filterDropdown(
                allLabel: "All Designations",
                value: _designationFilter,
                options: ['All', ..._designations],
                onChanged: (v) => setState(() => _designationFilter = v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _filterDropdown(
                allLabel: "All constituencies",
                value: _constituencyFilter,
                options: ['All', ..._constituencies],
                onChanged: (v) => setState(() => _constituencyFilter = v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // Date filter + Export CSV
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                child: Container(
                  height: 46,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined,
                          size: 18, color: primaryBlue),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _dateFilter == null
                              ? "Filter by date"
                              : DateFormat('dd MMM yyyy').format(_dateFilter!),
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: _dateFilter == null
                                ? AppTheme.mutedForeground
                                : AppTheme.foreground,
                          ),
                        ),
                      ),
                      if (_dateFilter != null)
                        InkWell(
                          onTap: () => setState(() => _dateFilter = null),
                          child: const Icon(Icons.close,
                              size: 16, color: AppTheme.muted),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 46,
              child: OutlinedButton.icon(
                onPressed: _exportCsv,
                icon: const Icon(Icons.download, size: 18),
                label: const Text("Export CSV"),
                style: OutlinedButton.styleFrom(
                  foregroundColor: primaryBlue,
                  side: BorderSide(color: primaryBlue.withOpacity(0.4)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _filterDropdown({
    required String allLabel,
    required String value,
    required List<String> options,
    required ValueChanged<String> onChanged,
  }) {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: AppTheme.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          isDense: true,
          icon: const Icon(Icons.arrow_drop_down, color: AppTheme.muted),
          style: const TextStyle(fontSize: 13, color: AppTheme.foreground),
          items: options
              .map((o) => DropdownMenuItem<String>(
                    value: o,
                    child: Text(
                      o == 'All' ? allLabel : o,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ))
              .toList(),
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }

  Widget _buildResultCount(int shown) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          Text(
            "Showing $shown of $_totalCount visitors",
            style: AppTheme.bodySm,
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Icon(Icons.person_search, size: 56, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Text(
            "No visitors found",
            style: AppTheme.headingSm.copyWith(color: AppTheme.muted),
          ),
          const SizedBox(height: 4),
          Text(
            "Try adjusting your search or filters",
            style: AppTheme.bodySm,
          ),
        ],
      ),
    );
  }

  Widget _buildVisitorCard(Map<String, dynamic> v) {
    final name = (v['name'] ?? 'Unknown').toString();
    final designation = (v['designation'] ?? '').toString();
    final phone = (v['phone'] ?? '').toString();
    final constituency = (v['constituency'] ?? '').toString();
    final ward = (v['wardVillage'] ?? '').toString();
    final purpose = (v['purpose'] ?? '').toString();
    final referencedBy = (v['referencedBy'] ?? '').toString();
    final id = v['id']?.toString();

    final dt = _dateOf(v);
    final dateStr = dt != null ? DateFormat('dd MMM yyyy').format(dt) : _rawDate(v);
    final timeStr = dt != null ? DateFormat('hh:mm a').format(dt) : '';

    String cw = '';
    if (constituency.isNotEmpty && ward.isNotEmpty) {
      cw = '$constituency / $ward';
    } else if (constituency.isNotEmpty) {
      cw = constituency;
    } else if (ward.isNotEmpty) {
      cw = ward;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: primaryBlue.withOpacity(0.1),
                child: const Icon(Icons.person, color: primaryBlue),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (designation.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: primaryBlue.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              designation,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: primaryBlue,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (phone.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.phone_outlined,
                              size: 14, color: Colors.grey.shade500),
                          const SizedBox(width: 4),
                          Text(phone, style: AppTheme.bodySm),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Actions on their own right-aligned row so the name/designation get
          // the full card width (no mid-word wrapping).
          Align(
            alignment: Alignment.centerRight,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: "View",
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.visibility_outlined,
                      color: primaryBlue),
                  onPressed: () => _showDetail(v),
                ),
                if (widget.role == Roles.admin && id != null)
                  IconButton(
                    tooltip: "Delete",
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: () => _deleteVisitor(id),
                  ),
              ],
            ),
          ),
          const Divider(height: 20),
          _cardLine(Icons.calendar_today_outlined,
              timeStr.isNotEmpty ? "$dateStr  •  $timeStr" : dateStr),
          if (cw.isNotEmpty) ...[
            const SizedBox(height: 6),
            _cardLine(Icons.location_on_outlined, cw),
          ],
          if (purpose.isNotEmpty) ...[
            const SizedBox(height: 6),
            _cardLine(Icons.description_outlined, "Purpose: $purpose"),
          ],
          if (referencedBy.isNotEmpty) ...[
            const SizedBox(height: 6),
            _cardLine(Icons.person_pin_outlined, "Referenced by: $referencedBy"),
          ],
        ],
      ),
    );
  }

  Widget _cardLine(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: Colors.grey.shade500),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 13, color: AppTheme.foreground),
          ),
        ),
      ],
    );
  }

  void _showDetail(Map<String, dynamic> v) {
    final dt = _dateOf(v);
    final dobDt = _parse(v['dob']);
    final createdBy = v['createdBy'];
    String loggedBy = '-';
    if (createdBy is Map) {
      final n = (createdBy['name'] ?? '').toString();
      final e = (createdBy['email'] ?? '').toString();
      loggedBy = [n, e].where((s) => s.isNotEmpty).join(' • ');
      if (loggedBy.isEmpty) loggedBy = '-';
    }

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        ),
        title: Row(
          children: [
            const Icon(Icons.person, color: primaryBlue),
            const SizedBox(width: 8),
            Expanded(child: Text((v['name'] ?? 'Visitor').toString())),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _detailRow("Designation", v['designation']),
              _detailRow("Phone", v['phone']),
              _detailRow(
                  "Date of Birth",
                  dobDt != null
                      ? DateFormat('dd MMM yyyy').format(dobDt)
                      : v['dob']),
              _detailRow("Constituency", v['constituency']),
              _detailRow("Ward / Village", v['wardVillage']),
              _detailRow(
                  "Visit Date",
                  dt != null
                      ? DateFormat('dd MMM yyyy  •  hh:mm a').format(dt)
                      : _rawDate(v)),
              _detailRow("Purpose", v['purpose']),
              _detailRow("Referenced By", v['referencedBy']),
              _detailRow(
                  "Official", (v['isOfficial'] == true) ? "Yes" : "No"),
              _detailRow("Logged By", loggedBy),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Close"),
          ),
        ],
      ),
    );
  }

  Widget _detailRow(String label, Object? value) {
    final v = (value == null || value.toString().trim().isEmpty)
        ? '-'
        : value.toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.muted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              v,
              style: const TextStyle(fontSize: 13, color: AppTheme.foreground),
            ),
          ),
        ],
      ),
    );
  }
}

// ================= ADD VISITOR SHEET =================

class _AddVisitorSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _AddVisitorSheet({required this.onCreated});

  @override
  State<_AddVisitorSheet> createState() => __AddVisitorSheetState();
}

class __AddVisitorSheetState extends State<_AddVisitorSheet> {
  final _formKey = GlobalKey<FormState>();

  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final purposeController = TextEditingController();

  bool submitting = false;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    purposeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/visitors", {
        "name": nameController.text.trim(),
        "phone": phoneController.text.trim(),
        "purpose": purposeController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Visitor added")),
        );
        await widget.onCreated();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, bottom: bottom + 16, top: 16),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Add Visitor",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: "Visitor Name",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? "Enter valid name" : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: phoneController,
              decoration: const InputDecoration(
                labelText: "Phone",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().length < 10)
                  ? "Enter valid phone"
                  : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: purposeController,
              decoration: const InputDecoration(
                labelText: "Purpose",
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? "Enter purpose" : null,
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A2E5C),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Save"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
