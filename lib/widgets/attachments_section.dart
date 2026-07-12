import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';

import '../models/attachment_model.dart';
import '../services/image_upload_service.dart';
import '../theme/app_theme.dart';

/// Self-fetching list of a record's attachments with per-file view/download.
///
/// Renders just the body (no header/card) so it can drop into a grievance
/// detail card or the admin detail dialog, which supply their own
/// "Attachments" heading. Fetches on init via
/// `ImageUploadService.listAttachments`; tapping a row downloads the file and
/// opens it in the OS viewer.
class AttachmentsSection extends StatefulWidget {
  final String contextId;
  final String contextType;

  const AttachmentsSection({
    super.key,
    required this.contextId,
    this.contextType = 'GRIEVANCE',
  });

  @override
  State<AttachmentsSection> createState() => _AttachmentsSectionState();
}

class _AttachmentsSectionState extends State<AttachmentsSection> {
  bool _loading = true;
  String? _error;
  List<Attachment> _items = const [];
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await ImageUploadService.listAttachments(
        widget.contextType,
        widget.contextId,
      );
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load attachments.';
        _loading = false;
      });
    }
  }

  Future<void> _open(Attachment a) async {
    if (_busy.contains(a.id)) return;
    setState(() => _busy.add(a.id));
    try {
      final file =
          await ImageUploadService.downloadAttachment(a.id, a.filename);
      final result = await OpenFilex.open(file.path);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open file: ${result.message}')),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Download error / no internet')),
      );
    } finally {
      if (mounted) setState(() => _busy.remove(a.id));
    }
  }

  IconData _iconFor(Attachment a) {
    if (a.isImage) return Icons.image_outlined;
    if (a.isPdf) return Icons.picture_as_pdf_outlined;
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 10),
            Text('Loading attachments…',
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          ],
        ),
      );
    }

    if (_error != null) {
      return Row(
        children: [
          Expanded(
            child: Text(
              _error!,
              style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
            ),
          ),
          TextButton(
            onPressed: _fetch,
            child: const Text('Retry'),
          ),
        ],
      );
    }

    if (_items.isEmpty) {
      return const Text(
        'No supporting files were uploaded with this grievance.',
        style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
      );
    }

    return Column(
      children: _items.map(_buildRow).toList(),
    );
  }

  Widget _buildRow(Attachment a) {
    final downloading = _busy.contains(a.id);
    final meta =
        [a.typeLabel, if (a.sizeLabel.isNotEmpty) a.sizeLabel].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: downloading ? null : () => _open(a),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(_iconFor(a), size: 22, color: AppTheme.primaryIndigo),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a.filename,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.foreground,
                        ),
                      ),
                      if (meta.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          meta,
                          style: const TextStyle(
                              fontSize: 11, color: Color(0xFF6B7280)),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                downloading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_rounded,
                        size: 20, color: AppTheme.primaryIndigo),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
