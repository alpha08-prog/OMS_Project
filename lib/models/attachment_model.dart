/// A file attached to a parent record (e.g. a grievance), as returned by
/// `GET /api/uploads?contextType=...&contextId=...`.
///
/// The backend `shapeAttachment` payload is:
/// `{ id, contextType, contextId, filename, mimeType, size, uploaderId,
///    createdAt, url }`.
class Attachment {
  final String id;
  final String filename;
  final String mimeType;
  final int size;
  final String url; // backend route, e.g. "/api/uploads/<id>"
  final String? createdAt;

  const Attachment({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.size,
    required this.url,
    this.createdAt,
  });

  factory Attachment.fromJson(Map<String, dynamic> json) {
    final rawSize = json['size'];
    return Attachment(
      id: (json['id'] ?? json['ROWID'] ?? '').toString(),
      filename: (json['filename'] ?? 'attachment').toString(),
      mimeType: (json['mimeType'] ?? '').toString(),
      size: rawSize is num
          ? rawSize.toInt()
          : int.tryParse('${rawSize ?? ''}') ?? 0,
      url: (json['url'] ?? '').toString(),
      createdAt: json['createdAt']?.toString(),
    );
  }

  bool get isImage => mimeType.startsWith('image/');

  bool get isPdf =>
      mimeType == 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

  /// Human-readable size, e.g. "820 KB" / "1.4 MB".
  String get sizeLabel {
    if (size <= 0) return '';
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(0)} KB';
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  /// Short type tag from the extension or MIME subtype, e.g. "PDF", "JPG".
  String get typeLabel {
    final dot = filename.lastIndexOf('.');
    if (dot != -1 && dot < filename.length - 1) {
      return filename.substring(dot + 1).toUpperCase();
    }
    final slash = mimeType.lastIndexOf('/');
    if (slash != -1 && slash < mimeType.length - 1) {
      return mimeType.substring(slash + 1).toUpperCase();
    }
    return 'FILE';
  }
}
