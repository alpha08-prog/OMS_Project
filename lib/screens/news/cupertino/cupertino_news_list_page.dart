import 'dart:convert';
import 'package:flutter/cupertino.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

const Color _kNewsPrimaryBlue = Color(0xFF0A2E5C);
const Color _kNewsBgLight = Color(0xFFF4F6FB);

class CupertinoNewsListPage extends StatefulWidget {
  final String role;
  const CupertinoNewsListPage({super.key, required this.role});

  @override
  State<CupertinoNewsListPage> createState() => _CupertinoNewsListPageState();
}

class _CupertinoNewsListPageState extends State<CupertinoNewsListPage> {
  bool loading = true;
  String? error;

  // Priority filter: "ALL" | "CRITICAL" | "HIGH" | "NORMAL"
  // Only ADMIN / SUPER_ADMIN see the chip row that controls this.
  String _priorityFilter = "ALL";

  List<Map<String, dynamic>> newsList = [];

  bool get _canSeeFilter =>
      widget.role == Roles.admin || widget.role == Roles.superAdmin;

  bool get _canCreateNews => widget.role == Roles.staff;

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
      final endpoint = _priorityFilter == "ALL"
          ? "/api/news"
          : "/api/news?priority=$_priorityFilter";
      final res = await HttpService.get(endpoint);

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          newsList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
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
      CupertinoToast.show(context, "Only staff can create news.", isError: true);
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
        CupertinoToast.show(context, "Delete failed (${res.statusCode})", isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    }
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
      navigationBar: CupertinoNavigationBar(
        middle: const Text("News & Intelligence"),
        backgroundColor: _kNewsPrimaryBlue,
        brightness: Brightness.dark,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _loadAll,
              child: const Icon(CupertinoIcons.refresh, color: CupertinoColors.white),
            ),
            if (_canCreateNews)
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: _openCreateSheet,
                child: const Icon(CupertinoIcons.add, color: CupertinoColors.white),
              ),
          ],
        ),
      ),
      child: SafeArea(
        child: loading
            ? const Center(child: CupertinoActivityIndicator())
            : error != null
                ? Center(child: Text(error!))
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_canSeeFilter) ...[
                        _buildPriorityFilterRow(),
                        const SizedBox(height: 12),
                      ],
                      if (newsList.isEmpty)
                        const Center(child: Text("No news available"))
                      else
                        ...newsList.map((n) => _newsCard(n)),
                    ],
                  ),
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
    final priority =
        (n["priority"] ?? n["severity"] ?? "NORMAL").toString().toUpperCase();
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
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: _kNewsPrimaryBlue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(CupertinoIcons.news, color: _kNewsPrimaryBlue),
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
                            horizontal: 8, vertical: 3),
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
                        color: CupertinoColors.systemGrey, fontSize: 12),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    createdAt,
                    style: const TextStyle(
                        color: CupertinoColors.systemGrey, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (isAdmin && id != null)
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: () => _deleteNews(id),
                child: const Icon(CupertinoIcons.delete,
                    color: CupertinoColors.destructiveRed),
              ),
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
      navigationBar: CupertinoNavigationBar(
        middle: const Text("News Details"),
        backgroundColor: _kNewsPrimaryBlue,
        brightness: Brightness.dark,
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
                child: const Icon(CupertinoIcons.pencil,
                    color: CupertinoColors.white),
              )
            : null,
      ),
      child: SafeArea(
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
                      fontSize: 18, fontWeight: FontWeight.bold),
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

class __CupertinoCreateNewsSheetState
    extends State<_CupertinoCreateNewsSheet> {
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
        CupertinoToast.show(context, "Failed (${res.statusCode})", isError: true);
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
                  child: Text(titleError!,
                      style: const TextStyle(
                          color: CupertinoColors.destructiveRed, fontSize: 12)),
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
                  child: Text(categoryError!,
                      style: const TextStyle(
                          color: CupertinoColors.destructiveRed, fontSize: 12)),
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
                  child: Text(contentError!,
                      style: const TextStyle(
                          color: CupertinoColors.destructiveRed, fontSize: 12)),
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(color: CupertinoColors.white)
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

class __CupertinoEditNewsSheetState
    extends State<_CupertinoEditNewsSheet> {
  late TextEditingController titleController;
  late TextEditingController categoryController;
  late TextEditingController severityController;
  late TextEditingController contentController;

  bool submitting = false;

  @override
  void initState() {
    super.initState();
    titleController =
        TextEditingController(text: widget.oldNews["title"] ?? "");
    categoryController =
        TextEditingController(text: widget.oldNews["category"] ?? "");
    severityController =
        TextEditingController(text: widget.oldNews["severity"] ?? "NORMAL");
    contentController =
        TextEditingController(text: widget.oldNews["content"] ?? "");
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
        CupertinoToast.show(context, "Update failed (${res.statusCode})", isError: true);
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
                    ? const CupertinoActivityIndicator(color: CupertinoColors.white)
                    : const Text("Save Changes"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
