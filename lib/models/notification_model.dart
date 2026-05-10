class AppNotification {
  final String id;
  final String? recipientId;
  final String type;
  final String title;
  final String body;
  final String? link;
  final String? referenceId;
  final String? referenceType;
  final bool isRead;
  final DateTime? createdAt;

  AppNotification({
    required this.id,
    this.recipientId,
    required this.type,
    required this.title,
    required this.body,
    this.link,
    this.referenceId,
    this.referenceType,
    required this.isRead,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    DateTime? parsed;
    final raw = json['createdAt'];
    if (raw is String && raw.isNotEmpty) {
      parsed = DateTime.tryParse(raw);
    } else if (raw is num) {
      parsed = DateTime.fromMillisecondsSinceEpoch(raw.toInt());
    }
    final readRaw = json['isRead'];
    final isRead = readRaw == true ||
        (readRaw is String && readRaw.toLowerCase() == 'true');
    return AppNotification(
      id: json['id']?.toString() ?? '',
      recipientId: json['recipientId']?.toString(),
      type: (json['type'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      link: json['link']?.toString(),
      referenceId: json['referenceId']?.toString(),
      referenceType: json['referenceType']?.toString(),
      isRead: isRead,
      createdAt: parsed,
    );
  }

  AppNotification copyWith({bool? isRead}) {
    return AppNotification(
      id: id,
      recipientId: recipientId,
      type: type,
      title: title,
      body: body,
      link: link,
      referenceId: referenceId,
      referenceType: referenceType,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }
}
