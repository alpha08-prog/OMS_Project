import 'dart:convert';
import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/csv_export.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

const Color _kNewsPrimaryBlue = Color(0xFF0A2E5C);
const Color _kNewsBgLight = Color(0xFFF4F6FB);

class CupertinoNewsListPage extends StatefulWidget {
  final String role;

  /// When set, the matching news item's detail sheet auto-opens on the
  /// first frame after the list loads. Used for notification deep-links.
  final String? highlightId;

  const CupertinoNewsListPage({
    super.key,
    required this.role,
    this.highlightId,
  });

  @override
  State<CupertinoNewsListPage> createState() => _CupertinoNewsListPageState();
}

class _CupertinoNewsListPageState extends State<CupertinoNewsListPage> {
  bool loading = true;
  String? error;

  // Priority filter: "ALL" | "CRITICAL" | "HIGH" | "NORMAL"
  // Only ADMIN / SUPER_ADMIN see the chip row that controls this.
  String _priorityFilter = "ALL";

  // Search + date filters
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = "";
  Timer? _searchDebounce;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _showFilters = false;

  // Client-side From/To range filter on createdAt. Feeds the visible list
  // and the CSV export (matches the app pattern in task_list_page.dart).
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> newsList = [];

  // One-shot guard so the deep-linked detail sheet only auto-opens once.
  bool _highlightHandled = false;

  bool get _canSeeFilter =>
      widget.role == Roles.admin || widget.role == Roles.superAdmin;

  bool get _canCreateNews => widget.role == Roles.staff;

  @override
  void dispose() {
    _searchController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await fetchNews();
  }

  Future<void> fetchNews() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final params = <String, String>{};
      if (_priorityFilter != "ALL") {
        params['priority'] = _priorityFilter;
      }
      if (_searchQuery.isNotEmpty) {
        params['search'] = _searchQuery;
      }
      if (_startDate != null) {
        params['startDate'] = _startDate!.toIso8601String();
      }
      if (_endDate != null) {
        params['endDate'] = _endDate!
            .add(const Duration(days: 1))
            .toIso8601String();
      }
      final qs = params.isEmpty
          ? ""
          : "?" +
                params.entries
                    .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
                    .join("&");
      final endpoint = "/api/news$qs";
      final res = await HttpService.get(endpoint);

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          newsList = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
        _maybeOpenHighlighted();
      } else {
        setState(() {
          error = "Failed to load news (${res.statusCode})";
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

  int? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id;
    if (id is String) return int.tryParse(id);
    return null;
  }

  void _openCreateSheet() {
    if (!_canCreateNews) {
      CupertinoToast.show(
        context,
        "Only staff can create news.",
        isError: true,
      );
      return;
    }

    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoCreateNewsSheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  Future<void> _deleteNews(int id) async {
    if (widget.role != Roles.admin) {
      CupertinoToast.show(context, "Only ADMIN can delete.", isError: true);
      return;
    }

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: const Text("Delete News"),
        content: const Text("Are you sure you want to delete this news?"),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Delete"),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/news/$id");
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Deleted");
        _loadAll();
      } else {
        CupertinoToast.show(
          context,
          "Delete failed (${res.statusCode})",
          isError: true,
        );
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    }
  }

  /// Notification deep-link: open the matching news item's detail sheet on
  /// the first frame after the list loads. Falls back to a toast if the
  /// item no longer exists.
  void _maybeOpenHighlighted() {
    if (_highlightHandled) return;
    final id = widget.highlightId;
    if (id == null || id.isEmpty) return;
    _highlightHandled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Map<String, dynamic>? match;
      for (final n in newsList) {
        if (n['id']?.toString() == id) {
          match = n;
          break;
        }
      }
      if (match != null) {
        _openDetails(match);
      } else {
        CupertinoToast.show(
          context,
          'That news item is no longer available',
          isError: true,
        );
      }
    });
  }

  void _openDetails(Map<String, dynamic> item) {
    Navigator.push(
      context,
      CupertinoPageRoute(
        builder: (_) => _CupertinoNewsDetailPage(
          role: widget.role,
          news: item,
          onUpdated: _loadAll,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: _kNewsBgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: "News & Intelligence",
            showBack: false,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleNews.isEmpty ? null : _exportCsv,
                  child: const Icon(
                    CupertinoIcons.arrow_down_doc,
                    size: 22,
                    color: CupertinoColors.white,
                  ),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _loadAll,
                  child: const Icon(
                    CupertinoIcons.refresh,
                    color: CupertinoColors.white,
                  ),
                ),
                if (_canCreateNews)
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _openCreateSheet,
                    child: const Icon(
                      CupertinoIcons.add,
                      color: CupertinoColors.white,
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: loading
                ? const Center(child: CupertinoActivityIndicator())
                : error != null
                ? Center(child: Text(error!))
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_canSeeFilter) ...[
                        _buildSearchAndFilterToggle(),
                        const SizedBox(height: 10),
                        if (_showFilters) ...[
                          _buildDateFilterRow(),
                          const SizedBox(height: 10),
                        ],
                        _buildPriorityFilterRow(),
                        if (_hasActiveFilters()) ...[
                          const SizedBox(height: 8),
                          _buildActiveFiltersBar(),
                        ],
                        const SizedBox(height: 12),
                      ],
                      CupertinoDateRangeFilter(
                        from: _dateFrom,
                        to: _dateTo,
                        tint: _kNewsPrimaryBlue,
                        padding: EdgeInsets.zero,
                        onFromChanged: (d) => setState(() => _dateFrom = d),
                        onToChanged: (d) => setState(() => _dateTo = d),
                        onClear: () => setState(() {
                          _dateFrom = null;
                          _dateTo = null;
                        }),
                      ),
                      const SizedBox(height: 12),
                      if (_visibleNews.isEmpty)
                        const Center(child: Text("No news available"))
                      else
                        ..._visibleNews.map((n) => _newsCard(n)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleNews {
    if (_dateFrom == null && _dateTo == null) return newsList;
    return newsList.where((n) {
      final dt = DateTime.tryParse(n['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'news',
      headers: const ['Headline', 'Priority', 'Category', 'Source', 'Created'],
      rows: _visibleNews.map((n) {
        String created = '';
        try {
          created = DateFormat(
            'dd MMM yyyy',
          ).format(DateTime.parse(n['createdAt'].toString()));
        } catch (_) {}
        return [
          n['headline'] ?? n['title'] ?? '',
          n['priority'] ?? n['severity'] ?? '',
          n['category'] ?? '',
          n['source'] ?? '',
          created,
        ];
      }).toList(),
    );
  }

  bool _hasActiveFilters() =>
      _searchQuery.isNotEmpty ||
      _startDate != null ||
      _endDate != null ||
      _priorityFilter != "ALL";

  Widget _buildSearchAndFilterToggle() {
    final hasDateFilter = _startDate != null || _endDate != null;
    return Row(
      children: [
        Expanded(
          child: CupertinoTextField(
            controller: _searchController,
            placeholder: "Search headline, description, source",
            placeholderStyle: const TextStyle(
              fontSize: 13,
              color: CupertinoColors.systemGrey,
            ),
            style: const TextStyle(fontSize: 13),
            prefix: const Padding(
              padding: EdgeInsets.only(left: 8),
              child: Icon(
                CupertinoIcons.search,
                size: 18,
                color: CupertinoColors.systemGrey,
              ),
            ),
            suffix: _searchQuery.isNotEmpty
                ? CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    minSize: 0,
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _searchQuery = "");
                      fetchNews();
                    },
                    child: const Icon(
                      CupertinoIcons.clear_circled_solid,
                      size: 16,
                      color: CupertinoColors.systemGrey,
                    ),
                  )
                : null,
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: CupertinoColors.systemGrey4),
            ),
            onChanged: (value) {
              _searchDebounce?.cancel();
              _searchDebounce = Timer(const Duration(milliseconds: 400), () {
                if (_searchQuery == value) return;
                setState(() => _searchQuery = value);
                fetchNews();
              });
            },
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => setState(() => _showFilters = !_showFilters),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: _showFilters || hasDateFilter
                  ? _kNewsPrimaryBlue
                  : CupertinoColors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: CupertinoColors.systemGrey4),
            ),
            child: Icon(
              CupertinoIcons.slider_horizontal_3,
              size: 20,
              color: _showFilters || hasDateFilter
                  ? CupertinoColors.white
                  : _kNewsPrimaryBlue,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDateFilterRow() {
    return Row(
      children: [
        Expanded(child: _datePickerButton(isStart: true)),
        const SizedBox(width: 8),
        Expanded(child: _datePickerButton(isStart: false)),
      ],
    );
  }

  Widget _datePickerButton({required bool isStart}) {
    final value = isStart ? _startDate : _endDate;
    final label = isStart ? "Start date" : "End date";
    return GestureDetector(
      onTap: () => _pickDate(isStart),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            const Icon(
              CupertinoIcons.calendar,
              size: 16,
              color: _kNewsPrimaryBlue,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                value != null ? DateFormat('d MMM yyyy').format(value) : label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: value != null
                      ? const Color(0xFF0F172A)
                      : CupertinoColors.systemGrey,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate(bool isStart) async {
    DateTime tempPicked = isStart
        ? (_startDate ?? DateTime.now())
        : (_endDate ?? DateTime.now());
    final confirmed = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (_) => Container(
        height: 280,
        color: CupertinoColors.systemBackground.resolveFrom(context),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                CupertinoButton(
                  child: const Text("Cancel"),
                  onPressed: () => Navigator.pop(context, false),
                ),
                CupertinoButton(
                  child: const Text("Done"),
                  onPressed: () => Navigator.pop(context, true),
                ),
              ],
            ),
            Expanded(
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.date,
                initialDateTime: tempPicked,
                minimumDate: DateTime(2020),
                maximumDate: DateTime.now().add(const Duration(days: 365)),
                onDateTimeChanged: (d) => tempPicked = d,
              ),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;
    setState(() {
      if (isStart) {
        _startDate = tempPicked;
      } else {
        _endDate = tempPicked;
      }
    });
    fetchNews();
  }

  Widget _buildActiveFiltersBar() {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (_startDate != null)
          _filterChip("From: ${DateFormat('d MMM').format(_startDate!)}", () {
            setState(() => _startDate = null);
            fetchNews();
          }),
        if (_endDate != null)
          _filterChip("To: ${DateFormat('d MMM').format(_endDate!)}", () {
            setState(() => _endDate = null);
            fetchNews();
          }),
        CupertinoButton(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
          minSize: 0,
          onPressed: () {
            _searchController.clear();
            setState(() {
              _searchQuery = "";
              _startDate = null;
              _endDate = null;
              _priorityFilter = "ALL";
            });
            fetchNews();
          },
          child: const Text(
            "Clear all",
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: CupertinoColors.systemRed,
            ),
          ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, VoidCallback onClear) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        border: Border.all(color: const Color(0xFFBFDBFE)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _kNewsPrimaryBlue,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onClear,
            child: const Icon(
              CupertinoIcons.clear_circled_solid,
              size: 14,
              color: _kNewsPrimaryBlue,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriorityFilterRow() {
    const options = [
      ("ALL", "All"),
      ("CRITICAL", "Critical"),
      ("HIGH", "High"),
      ("NORMAL", "Normal"),
    ];
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (value, label) = options[i];
          final selected = _priorityFilter == value;
          final color = _priorityColor(value);
          return GestureDetector(
            onTap: () {
              if (_priorityFilter == value) return;
              setState(() => _priorityFilter = value);
              fetchNews();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? color : CupertinoColors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: selected ? color : CupertinoColors.systemGrey4,
                ),
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: selected ? CupertinoColors.white : color,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  static Color _priorityColor(String p) {
    switch (p) {
      case "CRITICAL":
        return const Color(0xFFB91C1C);
      case "HIGH":
        return const Color(0xFFC2410C);
      case "NORMAL":
        return const Color(0xFF4B5563);
      case "ALL":
      default:
        return _kNewsPrimaryBlue;
    }
  }

  Widget _newsCard(Map<String, dynamic> n) {
    final id = _getId(n);
    // Backend returns headline + priority; older code used title/severity.
    // Read both so the card works either way.
    final title = (n["headline"] ?? n["title"] ?? "News").toString();
    final category = (n["category"] ?? "General").toString();
    final priority = (n["priority"] ?? n["severity"] ?? "NORMAL")
        .toString()
        .toUpperCase();
    final createdAt = (n["createdAt"] ?? "-").toString();
    final isAdmin = widget.role == Roles.admin;
    final priorityColor = _priorityColor(priority);

    return GestureDetector(
      onTap: () => _openDetails(n),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: CupertinoColors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: _kNewsPrimaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: const Icon(
                    CupertinoIcons.news,
                    color: _kNewsPrimaryBlue,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: priorityColor.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              priority,
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: priorityColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "Category: $category",
                        style: const TextStyle(
                          color: CupertinoColors.systemGrey,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        createdAt,
                        style: const TextStyle(
                          color: CupertinoColors.systemGrey,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (isAdmin && id != null) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: () => _deleteNews(id),
                  child: const Icon(
                    CupertinoIcons.delete,
                    color: CupertinoColors.destructiveRed,
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

// ================= DETAIL PAGE =================

class _CupertinoNewsDetailPage extends StatelessWidget {
  final String role;
  final Map<String, dynamic> news;
  final Future<void> Function() onUpdated;

  const _CupertinoNewsDetailPage({
    required this.role,
    required this.news,
    required this.onUpdated,
  });

  int? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id;
    if (id is String) return int.tryParse(id);
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final id = _getId(news);
    final title = news["title"] ?? "News";
    final category = news["category"] ?? "General";
    final severity = news["severity"] ?? "NORMAL";
    final content = news["content"] ?? news["summary"] ?? "-";
    final canEdit = AccessControl.can(role, ActionPermission.edit);

    return CupertinoPageScaffold(
      backgroundColor: _kNewsBgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: "News Details",
            trailing: (canEdit && id != null)
                ? CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: () {
                      showCupertinoModalPopup(
                        context: context,
                        builder: (_) => _CupertinoEditNewsSheet(
                          id: id,
                          oldNews: news,
                          onSaved: () async {
                            Navigator.pop(context);
                            Navigator.pop(context);
                            await onUpdated();
                          },
                        ),
                      );
                    },
                    child: const Icon(
                      CupertinoIcons.pencil,
                      color: CupertinoColors.white,
                    ),
                  )
                : null,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: CupertinoColors.black.withOpacity(0.05),
                      blurRadius: 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title.toString(),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text("Category: $category"),
                    const SizedBox(height: 6),
                    Text("Severity: $severity"),
                    Container(
                      height: 1,
                      margin: const EdgeInsets.symmetric(vertical: 15),
                      color: AppTheme.border,
                    ),
                    Text(content.toString()),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ================= CREATE SHEET =================

class _CupertinoCreateNewsSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CupertinoCreateNewsSheet({required this.onCreated});

  @override
  State<_CupertinoCreateNewsSheet> createState() =>
      __CupertinoCreateNewsSheetState();
}

class __CupertinoCreateNewsSheetState extends State<_CupertinoCreateNewsSheet> {
  final titleController = TextEditingController();
  final categoryController = TextEditingController();
  final severityController = TextEditingController(text: "NORMAL");
  final contentController = TextEditingController();

  bool submitting = false;
  String? titleError;
  String? categoryError;
  String? contentError;

  @override
  void dispose() {
    titleController.dispose();
    categoryController.dispose();
    severityController.dispose();
    contentController.dispose();
    super.dispose();
  }

  bool _validate() {
    bool valid = true;
    titleError = null;
    categoryError = null;
    contentError = null;

    if (titleController.text.trim().length < 3) {
      titleError = "Enter valid title";
      valid = false;
    }
    if (categoryController.text.trim().isEmpty) {
      categoryError = "Enter category";
      valid = false;
    }
    if (contentController.text.trim().isEmpty) {
      contentError = "Enter content";
      valid = false;
    }
    setState(() {});
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/news", {
        "title": titleController.text.trim(),
        "category": categoryController.text.trim(),
        "severity": severityController.text.trim(),
        "content": contentController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        CupertinoToast.show(context, "News created");
        await widget.onCreated();
      } else {
        CupertinoToast.show(
          context,
          "Failed (${res.statusCode})",
          isError: true,
        );
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: bottom + 16,
        top: 16,
      ),
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey4,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              "Create News",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            CupertinoTextField(
              controller: titleController,
              placeholder: "Title",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            if (titleError != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    titleError!,
                    style: const TextStyle(
                      color: CupertinoColors.destructiveRed,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: categoryController,
              placeholder: "Category",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            if (categoryError != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    categoryError!,
                    style: const TextStyle(
                      color: CupertinoColors.destructiveRed,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: severityController,
              placeholder: "Severity (NORMAL/CRITICAL)",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: contentController,
              placeholder: "Content",
              maxLines: 4,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            if (contentError != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    contentError!,
                    style: const TextStyle(
                      color: CupertinoColors.destructiveRed,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white,
                      )
                    : const Text("Save"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ================= EDIT SHEET =================

class _CupertinoEditNewsSheet extends StatefulWidget {
  final int id;
  final Map<String, dynamic> oldNews;
  final Future<void> Function() onSaved;

  const _CupertinoEditNewsSheet({
    required this.id,
    required this.oldNews,
    required this.onSaved,
  });

  @override
  State<_CupertinoEditNewsSheet> createState() =>
      __CupertinoEditNewsSheetState();
}

class __CupertinoEditNewsSheetState extends State<_CupertinoEditNewsSheet> {
  late TextEditingController titleController;
  late TextEditingController categoryController;
  late TextEditingController severityController;
  late TextEditingController contentController;

  bool submitting = false;

  @override
  void initState() {
    super.initState();
    titleController = TextEditingController(
      text: widget.oldNews["title"] ?? "",
    );
    categoryController = TextEditingController(
      text: widget.oldNews["category"] ?? "",
    );
    severityController = TextEditingController(
      text: widget.oldNews["severity"] ?? "NORMAL",
    );
    contentController = TextEditingController(
      text: widget.oldNews["content"] ?? "",
    );
  }

  @override
  void dispose() {
    titleController.dispose();
    categoryController.dispose();
    severityController.dispose();
    contentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (titleController.text.trim().length < 3) {
      CupertinoToast.show(context, "Enter valid title", isError: true);
      return;
    }

    setState(() => submitting = true);

    try {
      final res = await HttpService.put("/api/news/${widget.id}", {
        "title": titleController.text.trim(),
        "category": categoryController.text.trim(),
        "severity": severityController.text.trim(),
        "content": contentController.text.trim(),
      });

      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Updated");
        await widget.onSaved();
      } else {
        CupertinoToast.show(
          context,
          "Update failed (${res.statusCode})",
          isError: true,
        );
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: bottom + 16,
        top: 16,
      ),
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey4,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              "Edit News",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            CupertinoTextField(
              controller: titleController,
              placeholder: "Title",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: categoryController,
              placeholder: "Category",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: severityController,
              placeholder: "Severity",
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: contentController,
              placeholder: "Content",
              maxLines: 4,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white,
                      )
                    : const Text("Save Changes"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
