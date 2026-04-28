import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';

// ✅ Global constant so all classes can access it
const Color kNewsPrimaryBlue = Color(0xFF0A2E5C);
const Color kNewsBgLight = Color(0xFFF4F6FB);

class NewsListPage extends StatefulWidget {
  final String role;
  const NewsListPage({super.key, required this.role});

  @override
  State<NewsListPage> createState() => _NewsListPageState();
}

class _NewsListPageState extends State<NewsListPage> {
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only staff can create news.")),
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
      builder: (_) => _CreateNewsSheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  Future<void> _deleteNews(int id) async {
    if (widget.role != Roles.admin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can delete.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete News"),
        content: const Text("Are you sure you want to delete this news?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
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
      final res = await HttpService.delete("/api/news/$id");
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Deleted ✅")),
        );
        _loadAll();
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

  void _openDetails(Map<String, dynamic> item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => NewsDetailPage(
          role: widget.role,
          news: item,
          onUpdated: _loadAll,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kNewsBgLight,
      appBar: AppBar(
        title: const Text("News & Intelligence"),
        backgroundColor: kNewsPrimaryBlue,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAll,
          )
        ],
      ),
      floatingActionButton: _canCreateNews
          ? FloatingActionButton(
              backgroundColor: kNewsPrimaryBlue,
              onPressed: _openCreateSheet,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: loading
          ? const Center(child: CircularProgressIndicator())
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
                      ...newsList.map((n) => _newsCard(n)).toList(),
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
          return ChoiceChip(
            label: Text(label),
            selected: selected,
            showCheckmark: false,
            labelStyle: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : color,
            ),
            selectedColor: color,
            backgroundColor: Colors.white,
            side: BorderSide(color: selected ? color : Colors.grey.shade300),
            onSelected: (s) {
              if (!s || _priorityFilter == value) return;
              setState(() => _priorityFilter = value);
              fetchNews();
            },
          );
        },
      ),
    );
  }

  static Color _priorityColor(String p) {
    switch (p) {
      case "CRITICAL":
        return Colors.red.shade700;
      case "HIGH":
        return Colors.orange.shade800;
      case "NORMAL":
        return Colors.grey.shade700;
      case "ALL":
      default:
        return kNewsPrimaryBlue;
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

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => _openDetails(n),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: kNewsPrimaryBlue.withOpacity(0.1),
              child: const Icon(Icons.newspaper, color: kNewsPrimaryBlue),
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
                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    createdAt,
                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (isAdmin && id != null)
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red),
                onPressed: () => _deleteNews(id),
              ),
          ],
        ),
      ),
    );
  }
}

// ================= DETAIL PAGE =================

class NewsDetailPage extends StatelessWidget {
  final String role;
  final Map<String, dynamic> news;
  final Future<void> Function() onUpdated;

  const NewsDetailPage({
    super.key,
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

    return Scaffold(
      backgroundColor: kNewsBgLight,
      appBar: AppBar(
        title: const Text("News Details"),
        backgroundColor: kNewsPrimaryBlue,
        actions: [
          if (canEdit && id != null)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(18)),
                  ),
                  builder: (_) => _EditNewsSheet(
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
            )
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
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
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Text("Category: $category"),
              const SizedBox(height: 6),
              Text("Severity: $severity"),
              const Divider(height: 30),
              Text(content.toString()),
            ],
          ),
        ),
      ),
    );
  }
}

// ================= CREATE SHEET =================

class _CreateNewsSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CreateNewsSheet({required this.onCreated});

  @override
  State<_CreateNewsSheet> createState() => __CreateNewsSheetState();
}

class __CreateNewsSheetState extends State<_CreateNewsSheet> {
  final _formKey = GlobalKey<FormState>();

  final titleController = TextEditingController();
  final categoryController = TextEditingController();
  final severityController = TextEditingController(text: "NORMAL");
  final contentController = TextEditingController();

  bool submitting = false;

  @override
  void dispose() {
    titleController.dispose();
    categoryController.dispose();
    severityController.dispose();
    contentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/news", {
        "title": titleController.text.trim(),
        "category": categoryController.text.trim(),
        "severity": severityController.text.trim(),
        "content": contentController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("News created ✅")),
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
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: bottom + 16,
        top: 16,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Create News",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: titleController,
              decoration: const InputDecoration(
                labelText: "Title",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().length < 3)
                  ? "Enter valid title"
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: categoryController,
              decoration: const InputDecoration(
                labelText: "Category",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? "Enter category"
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: severityController,
              decoration: const InputDecoration(
                labelText: "Severity (NORMAL/CRITICAL)",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: contentController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: "Content",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? "Enter content"
                  : null,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: kNewsPrimaryBlue,
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

// ================= EDIT SHEET =================

class _EditNewsSheet extends StatefulWidget {
  final int id;
  final Map<String, dynamic> oldNews;
  final Future<void> Function() onSaved;

  const _EditNewsSheet({
    required this.id,
    required this.oldNews,
    required this.onSaved,
  });

  @override
  State<_EditNewsSheet> createState() => __EditNewsSheetState();
}

class __EditNewsSheetState extends State<_EditNewsSheet> {
  final _formKey = GlobalKey<FormState>();

  late TextEditingController titleController;
  late TextEditingController categoryController;
  late TextEditingController severityController;
  late TextEditingController contentController;

  bool submitting = false;

  @override
  void initState() {
    super.initState();
    titleController = TextEditingController(text: widget.oldNews["title"] ?? "");
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
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.put("/api/news/${widget.id}", {
        "title": titleController.text.trim(),
        "category": categoryController.text.trim(),
        "severity": severityController.text.trim(),
        "content": contentController.text.trim(),
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Updated ✅")),
        );
        await widget.onSaved();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Update failed (${res.statusCode})")),
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
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: bottom + 16,
        top: 16,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Edit News",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: titleController,
              decoration: const InputDecoration(
                labelText: "Title",
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().length < 3)
                  ? "Enter valid title"
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: categoryController,
              decoration: const InputDecoration(
                labelText: "Category",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: severityController,
              decoration: const InputDecoration(
                labelText: "Severity",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: contentController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: "Content",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: kNewsPrimaryBlue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Save Changes"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
