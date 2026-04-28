import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

/// Staff-only "Add News" form. Creates a NewsIntelligence on the backend.
///
/// Has both a paste-URL field (`imageUrl` — actually persists) AND a visual
/// file-upload zone (cosmetic only — no backend upload endpoint exists).
/// "Referenced By" is shown for parity with the reference UI but the backend
/// has no column for it, so it's silently dropped on submit.
class NewsAddPage extends StatefulWidget {
  const NewsAddPage({super.key});

  @override
  State<NewsAddPage> createState() => _NewsAddPageState();
}

class _NewsAddPageState extends State<NewsAddPage> {
  final _formKey = GlobalKey<FormState>();

  final headlineController = TextEditingController();
  final mediaSourceController = TextEditingController();
  final regionController = TextEditingController();
  final descriptionController = TextEditingController();
  final imageUrlController = TextEditingController();
  final referencedByController = TextEditingController();

  String _selectedCategory = 'OTHER';
  String _selectedPriority = 'NORMAL';
  PlatformFile? _pickedFile;
  bool _submitting = false;

  static const int _maxFileBytes = 10 * 1024 * 1024;
  static const List<String> _allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];

  final List<Map<String, String>> _categories = const [
    {'value': 'DEVELOPMENT_WORK', 'label': 'Development Work'},
    {'value': 'CONSPIRACY_FAKE_NEWS', 'label': 'Conspiracy / Fake News'},
    {'value': 'LEADER_ACTIVITY', 'label': 'Leader Activity'},
    {'value': 'PARTY_ACTIVITY', 'label': 'Party Activity'},
    {'value': 'OPPOSITION', 'label': 'Opposition'},
    {'value': 'OTHER', 'label': 'Other'},
  ];

  final List<Map<String, String>> _priorities = const [
    {'value': 'NORMAL', 'label': 'Normal'},
    {'value': 'HIGH', 'label': 'High'},
    {'value': 'CRITICAL', 'label': 'Critical'},
  ];

  @override
  void dispose() {
    headlineController.dispose();
    mediaSourceController.dispose();
    regionController.dispose();
    descriptionController.dispose();
    imageUrlController.dispose();
    referencedByController.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: _allowedExtensions,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.single;
      if (file.size > _maxFileBytes) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("File too large. Max 10 MB.")),
        );
        return;
      }
      setState(() => _pickedFile = file);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not pick file")),
      );
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    return "${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB";
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);

    try {
      final body = <String, dynamic>{
        "headline": headlineController.text.trim(),
        "category": _selectedCategory,
        "priority": _selectedPriority,
        "mediaSource": mediaSourceController.text.trim(),
        "region": regionController.text.trim(),
      };

      final desc = descriptionController.text.trim();
      if (desc.isNotEmpty) body["description"] = desc;

      final imageUrl = imageUrlController.text.trim();
      if (imageUrl.isNotEmpty) body["imageUrl"] = imageUrl;

      final res = await HttpService.post("/api/news", body);

      if (!mounted) return;
      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("News added successfully"),
            backgroundColor: AppTheme.successGreen,
            duration: Duration(seconds: 2),
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Add News",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: "NEWS DETAILS",
              children: [
                TextFormField(
                  controller: headlineController,
                  decoration: const InputDecoration(
                    labelText: "Headline *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.title),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Headline is required"
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _selectedCategory,
                  decoration: const InputDecoration(
                    labelText: "Category *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.category),
                  ),
                  items: _categories
                      .map((c) => DropdownMenuItem(
                            value: c['value'],
                            child: Text(c['label']!),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _selectedCategory = v ?? 'OTHER'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _selectedPriority,
                  decoration: const InputDecoration(
                    labelText: "Priority",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.flag),
                  ),
                  items: _priorities
                      .map((p) => DropdownMenuItem(
                            value: p['value'],
                            child: Text(p['label']!),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _selectedPriority = v ?? 'NORMAL'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: regionController,
                  decoration: const InputDecoration(
                    labelText: "Region *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Region is required"
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: descriptionController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: "Description (optional)",
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "SOURCE INFORMATION",
              children: [
                TextFormField(
                  controller: mediaSourceController,
                  decoration: const InputDecoration(
                    labelText: "Media Source *",
                    hintText: "Newspaper / Social Media link / Informant name",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.source),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Media source is required"
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: referencedByController,
                  decoration: const InputDecoration(
                    labelText: "Referenced By",
                    hintText: "Eg: Reporter, Informant, Party Worker",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person_pin),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildEvidenceCard(),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: AppTheme.primaryButton(),
                child: _submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        "Submit News",
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildEvidenceCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Text(
              "EVIDENCE / IMAGE URL",
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryIndigo,
                letterSpacing: 0.5,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextFormField(
                  controller: imageUrlController,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: "Image URL (optional)",
                    hintText: "https://example.com/screenshot.jpg",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.link),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "URL to screenshot or image evidence",
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 16),
                _pickedFile == null
                    ? _buildUploadZone()
                    : _buildPickedFilePreview(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUploadZone() {
    return InkWell(
      onTap: _pickFile,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        decoration: BoxDecoration(
          color: AppTheme.primaryIndigo50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.primaryIndigo.withOpacity(0.4),
            width: 1.5,
          ),
        ),
        child: Column(
          children: [
            const Icon(
              Icons.cloud_upload_outlined,
              size: 30,
              color: AppTheme.primaryIndigo,
            ),
            const SizedBox(height: 8),
            const Text(
              "Click to upload a file",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryIndigo,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "PNG, JPG, PDF up to 10MB",
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPickedFilePreview() {
    final file = _pickedFile!;
    final ext = (file.extension ?? '').toLowerCase();
    final isPdf = ext == 'pdf';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.primaryIndigo.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              isPdf ? Icons.picture_as_pdf : Icons.image,
              color: AppTheme.primaryIndigo,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.foreground,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _formatBytes(file.size),
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => setState(() => _pickedFile = null),
            icon: const Icon(Icons.close, size: 20),
            color: Colors.grey.shade600,
          ),
        ],
      ),
    );
  }

  Widget _buildCard({
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryIndigo,
                letterSpacing: 0.5,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }
}
