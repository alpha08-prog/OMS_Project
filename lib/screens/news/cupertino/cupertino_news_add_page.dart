import 'dart:convert';
import 'package:flutter/cupertino.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/attachment_picker.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoNewsAddPage extends StatefulWidget {
  const CupertinoNewsAddPage({super.key});

  @override
  State<CupertinoNewsAddPage> createState() => _CupertinoNewsAddPageState();
}

class _CupertinoNewsAddPageState extends State<CupertinoNewsAddPage> {
  final headlineController = TextEditingController();
  final mediaSourceController = TextEditingController();
  final regionController = TextEditingController();
  final descriptionController = TextEditingController();
  final imageUrlController = TextEditingController();
  final referencedByController = TextEditingController();

  String _selectedCategory = 'OTHER';
  String _selectedPriority = 'NORMAL';
  PickedAttachment? _pickedFile;
  bool _submitting = false;

  String? _headlineError;
  String? _mediaSourceError;
  String? _regionError;

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

  String _labelOf(List<Map<String, String>> list, String value) {
    final match = list.firstWhere((e) => e['value'] == value,
        orElse: () => {'label': value});
    return match['label'] ?? value;
  }

  bool _validate() {
    bool ok = true;
    _headlineError =
        headlineController.text.trim().isEmpty ? "Headline is required" : null;
    if (_headlineError != null) ok = false;

    _mediaSourceError = mediaSourceController.text.trim().isEmpty
        ? "Media source is required"
        : null;
    if (_mediaSourceError != null) ok = false;

    _regionError =
        regionController.text.trim().isEmpty ? "Region is required" : null;
    if (_regionError != null) ok = false;

    setState(() {});
    return ok;
  }

  Future<void> _pickFile() async {
    try {
      final picked = await AttachmentPicker.pick(
        context,
        allowedExtensions: _allowedExtensions,
      );
      if (picked == null) return;

      if (picked.size > _maxFileBytes) {
        if (!mounted) return;
        CupertinoToast.show(context, "File too large. Max 10 MB.",
            isError: true);
        return;
      }
      setState(() => _pickedFile = picked);
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Could not pick file", isError: true);
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    return "${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB";
  }

  Future<void> _submit() async {
    if (!_validate()) return;
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
      if (imageUrl.isNotEmpty) {
        final uri = Uri.tryParse(imageUrl);
        if (uri == null || !uri.isAbsolute ||
            (uri.scheme != 'http' && uri.scheme != 'https')) {
          CupertinoToast.show(
              context, "Image URL must start with http:// or https://",
              isError: true);
          if (mounted) setState(() => _submitting = false);
          return;
        }
        body["imageUrl"] = imageUrl;
      }

      final res = await HttpService.post("/api/news", body);

      if (!mounted) return;
      if (res.statusCode == 201 || res.statusCode == 200) {
        CupertinoToast.show(context, "News added successfully");
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: "Add News"),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: "NEWS DETAILS",
              children: [
                _textField(
                  controller: headlineController,
                  placeholder: "Headline *",
                  prefixIcon: CupertinoIcons.textformat,
                  error: _headlineError,
                ),
                const SizedBox(height: 12),
                _pickerField(
                  label: "Category *",
                  currentValue: _labelOf(_categories, _selectedCategory),
                  icon: CupertinoIcons.tag,
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: _categories.map((e) => e['label']!).toList(),
                      currentValue: _labelOf(_categories, _selectedCategory),
                      title: "Category",
                      onSelected: (label) {
                        final match = _categories.firstWhere(
                          (e) => e['label'] == label,
                          orElse: () => {'value': 'OTHER'},
                        );
                        setState(() => _selectedCategory = match['value']!);
                      },
                    );
                  },
                ),
                const SizedBox(height: 12),
                _pickerField(
                  label: "Priority",
                  currentValue: _labelOf(_priorities, _selectedPriority),
                  icon: CupertinoIcons.flag,
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: _priorities.map((e) => e['label']!).toList(),
                      currentValue: _labelOf(_priorities, _selectedPriority),
                      title: "Priority",
                      onSelected: (label) {
                        final match = _priorities.firstWhere(
                          (e) => e['label'] == label,
                          orElse: () => {'value': 'NORMAL'},
                        );
                        setState(() => _selectedPriority = match['value']!);
                      },
                    );
                  },
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: regionController,
                  placeholder: "Region *",
                  prefixIcon: CupertinoIcons.location,
                  error: _regionError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: descriptionController,
                  placeholder: "Description (optional)",
                  maxLines: 4,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "SOURCE INFORMATION",
              children: [
                _textField(
                  controller: mediaSourceController,
                  placeholder:
                      "Media Source * (Newspaper / Social Media / Informant)",
                  prefixIcon: CupertinoIcons.news,
                  error: _mediaSourceError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: referencedByController,
                  placeholder:
                      "Referenced By (Reporter / Informant / Party Worker)",
                  prefixIcon: CupertinoIcons.person_2,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildEvidenceCard(),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: _submitting ? null : _submit,
                padding: const EdgeInsets.symmetric(vertical: 16),
                borderRadius: BorderRadius.circular(12),
                child: _submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
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
        ],
      ),
    );
  }

  Widget _buildEvidenceCard() {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.white,
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
                _textField(
                  controller: imageUrlController,
                  placeholder: "https://example.com/screenshot.jpg",
                  prefixIcon: CupertinoIcons.link,
                  keyboardType: TextInputType.url,
                ),
                const SizedBox(height: 6),
                const Text(
                  "URL to screenshot or image evidence",
                  style: TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey,
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
    return GestureDetector(
      onTap: _pickFile,
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
        child: const Column(
          children: [
            Icon(
              CupertinoIcons.cloud_upload,
              size: 30,
              color: AppTheme.primaryIndigo,
            ),
            SizedBox(height: 8),
            Text(
              "Click to upload a file",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryIndigo,
              ),
            ),
            SizedBox(height: 4),
            Text(
              "PNG, JPG, PDF up to 10MB",
              style: TextStyle(
                fontSize: 12,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPickedFilePreview() {
    final file = _pickedFile!;
    final ext =
        file.name.contains('.') ? file.name.split('.').last.toLowerCase() : '';
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
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              isPdf ? CupertinoIcons.doc_richtext : CupertinoIcons.photo,
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
                  style: const TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey,
                  ),
                ),
              ],
            ),
          ),
          CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: () => setState(() => _pickedFile = null),
            child: const Icon(CupertinoIcons.clear_circled_solid,
                size: 22, color: CupertinoColors.systemGrey),
          ),
        ],
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String placeholder,
    IconData? prefixIcon,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          keyboardType: keyboardType,
          maxLines: maxLines,
          prefix: prefixIcon != null
              ? Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: Icon(prefixIcon,
                      color: CupertinoColors.systemGrey, size: 20),
                )
              : null,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey6,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              error,
              style: const TextStyle(
                fontSize: 12,
                color: CupertinoColors.destructiveRed,
              ),
            ),
          ),
      ],
    );
  }

  Widget _pickerField({
    required String label,
    required String currentValue,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            Icon(icon, color: CupertinoColors.systemGrey, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    currentValue,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 16, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _buildCard({
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.white,
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
