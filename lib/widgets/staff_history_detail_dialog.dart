import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/app_theme.dart';

class StaffHistoryDetailDialog extends StatelessWidget {
  final String type;
  final String title;
  final String status;
  final dynamic date;
  final Map<String, dynamic> raw;

  const StaffHistoryDetailDialog({
    super.key,
    required this.type,
    required this.title,
    required this.status,
    required this.date,
    required this.raw,
  });

  static Future<void> show({
    required BuildContext context,
    required String type,
    required String title,
    required String status,
    required dynamic date,
    required Map<String, dynamic> raw,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (_) => StaffHistoryDetailDialog(
        type: type,
        title: title,
        status: status,
        date: date,
        raw: raw,
      ),
    );
  }

  String _fmtDate(dynamic v) {
    if (v == null) return '';
    try {
      final dt = DateTime.parse(v.toString()).toLocal();
      return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
    } catch (_) {
      return v.toString();
    }
  }

  Color _statusColor(String s) {
    switch (s.toUpperCase()) {
      case 'OPEN':
      case 'PENDING':
        return Colors.orange;
      case 'IN_PROGRESS':
      case 'ASSIGNED':
        return Colors.blue;
      case 'VERIFIED':
      case 'APPROVED':
      case 'ACCEPTED':
      case 'COMPLETED':
      case 'RESOLVED':
        return Colors.green;
      case 'REJECTED':
      case 'REGRET':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  List<MapEntry<String, String>> _fields() {
    String? s(dynamic v) {
      if (v == null) return null;
      final str = v.toString().trim();
      if (str.isEmpty || str == 'null') return null;
      return str;
    }

    String? sd(dynamic v) {
      if (v == null) return null;
      try {
        final dt = DateTime.parse(v.toString()).toLocal();
        return DateFormat('dd MMM yyyy').format(dt);
      } catch (_) {
        return v.toString();
      }
    }

    String? sdt(dynamic v) {
      if (v == null) return null;
      try {
        final dt = DateTime.parse(v.toString()).toLocal();
        return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
      } catch (_) {
        return v.toString();
      }
    }

    final entries = <MapEntry<String, String>>[];
    void put(String label, String? value) {
      if (value != null && value.isNotEmpty) {
        entries.add(MapEntry(label, value));
      }
    }

    switch (type) {
      case 'TRAIN_REQUEST':
        put('PNR Number', s(raw['pnrNumber']));
        final passengers = raw['passengers'];
        if (passengers is List && passengers.isNotEmpty) {
          final names = passengers
              .map((p) => (p is Map ? p['name']?.toString() : null))
              .where((n) => n != null && n.toString().trim().isNotEmpty)
              .join(', ');
          put('Passenger Name', names);
        }
        put('Journey Class', s(raw['journeyClass']));
        put('Date of Journey', sd(raw['dateOfJourney']));
        put('From Station', s(raw['fromStation']));
        put('To Station', s(raw['toStation']));
        put('Train Name', s(raw['trainName']));
        put('Train Number', s(raw['trainNumber']));
        put('Booking Type',
            s(raw['bookingType'])?.replaceAll('_', ' '));
        put('Contact Number', s(raw['contactNumber']));
        put('Referenced By', s(raw['referencedBy']));
        put('Remarks', s(raw['remarks']));
        break;

      case 'TOUR_PROGRAM':
        put('Event Name', s(raw['eventName']));
        put('Organizer', s(raw['organizer']));
        put('Date / Time', sdt(raw['dateTime']));
        put('Venue', s(raw['venue']));
        put('Location', s(raw['location']));
        put('Constituency', s(raw['constituency']));
        put('Decision', s(raw['decision']));
        put('Description', s(raw['description']));
        put('Remarks', s(raw['remarks']));
        break;

      case 'GRIEVANCE':
        put('Petitioner Name', s(raw['petitionerName']));
        put('Mobile Number', s(raw['mobileNumber']));
        put('Constituency', s(raw['constituency']));
        put('Grievance Type',
            s(raw['grievanceType'])?.replaceAll('_', ' '));
        put('Description', s(raw['description']));
        put('Action Required',
            s(raw['actionRequired'])?.replaceAll('_', ' '));
        put('Referenced By', s(raw['referencedBy']));
        final monetary = raw['monetaryValue'];
        if (monetary != null && monetary.toString().isNotEmpty) {
          put('Monetary Value', '₹${monetary.toString()}');
        }
        put('Source',
            s(raw['source']) == 'OFFICE' ? 'Office' : null);
        break;

      case 'VISITOR':
        put('Name', s(raw['name']));
        put('Purpose', s(raw['purpose']));
        put('Mobile', s(raw['mobile']) ?? s(raw['mobileNumber']));
        put('Address', s(raw['address']));
        put('Time In', sdt(raw['timeIn']) ?? sdt(raw['inTime']));
        put('Time Out', sdt(raw['timeOut']) ?? sdt(raw['outTime']));
        put('Remarks', s(raw['remarks']));
        break;

      default:
        for (final k in raw.keys) {
          if (k == 'id' || k == 'createdAt' || k == 'updatedAt') continue;
          final v = s(raw[k]);
          if (v != null && v.length < 200) {
            put(k.toString(), v);
          }
        }
    }

    return entries;
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final maxW = media.size.width > 700 ? 560.0 : media.size.width - 32.0;
    final maxH = media.size.height * 0.85;
    final fields = _fields();
    final dateStr = _fmtDate(date);
    final statusColor = _statusColor(status);

    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxW, maxHeight: maxH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    color: Colors.grey,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // Status + Date
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      status.toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      dateStr,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Fields card
            Flexible(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < fields.length; i++) ...[
                          if (i > 0) const SizedBox(height: 14),
                          Text(
                            fields[i].key.toUpperCase(),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF6B7280),
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            fields[i].value,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground,
                            ),
                          ),
                        ],
                        if (fields.isEmpty)
                          Text(
                            "No additional details",
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
