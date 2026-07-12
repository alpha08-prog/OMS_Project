import 'package:flutter/cupertino.dart';

import 'package:open_filex/open_filex.dart';

import '../../models/attachment_model.dart';
import '../../services/image_upload_service.dart';
import '../../theme/app_theme.dart';
import 'cupertino_toast.dart';

/// Cupertino twin of [AttachmentsSection]: self-fetching list of a record's
/// attachments with per-file view/download. Renders body only (no header) so
/// the caller supplies the "Attachments" heading.
class CupertinoAttachmentsSection extends StatefulWidget {
  final String contextId;
  final String contextType;

  const CupertinoAttachmentsSection({
    super.key,
    required this.contextId,
    this.contextType = 'GRIEVANCE',
  });

  @override
  State<CupertinoAttachmentsSection> createState() =>
      _CupertinoAttachmentsSectionState();
}

class _CupertinoAttachmentsSectionState
    extends State<CupertinoAttachmentsSection> {
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
        CupertinoToast.show(context, 'Could not open file: ${result.message}',
            isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, 'Download error / no internet',
          isError: true);
    } finally {
      if (mounted) setState(() => _busy.remove(a.id));
    }
  }

  IconData _iconFor(Attachment a) {
    if (a.isImage) return CupertinoIcons.photo;
    if (a.isPdf) return CupertinoIcons.doc_text_fill;
    return CupertinoIcons.doc;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            CupertinoActivityIndicator(radius: 8),
            SizedBox(width: 10),
            Text('Loading attachments…',
                style:
                    TextStyle(fontSize: 12, color: CupertinoColors.systemGrey)),
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
              style: const TextStyle(
                  fontSize: 12, color: CupertinoColors.systemGrey),
            ),
          ),
          CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: _fetch,
            child: const Text('Retry', style: TextStyle(fontSize: 13)),
          ),
        ],
      );
    }

    if (_items.isEmpty) {
      return const Text(
        'No supporting files were uploaded with this grievance.',
        style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey),
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
      child: CupertinoButton(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        borderRadius: BorderRadius.circular(8),
        onPressed: downloading ? null : () => _open(a),
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
                          fontSize: 11, color: CupertinoColors.systemGrey),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            downloading
                ? const CupertinoActivityIndicator(radius: 9)
                : const Icon(CupertinoIcons.cloud_download,
                    size: 20, color: AppTheme.primaryIndigo),
          ],
        ),
      ),
    );
  }
}
