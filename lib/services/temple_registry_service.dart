import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'http_service.dart';

/// One entry in the TEMPLE_REGISTRY exposed by `GET /api/pdf/temple-registry`.
class TempleEntry {
  final String key;
  final String deity;
  final List<String> recipient;
  final List<String> defaultServices;

  const TempleEntry({
    required this.key,
    required this.deity,
    required this.recipient,
    required this.defaultServices,
  });

  factory TempleEntry.fromJson(Map<String, dynamic> j) {
    return TempleEntry(
      key: j['key']?.toString() ?? '',
      deity: j['deity']?.toString() ?? '',
      recipient: (j['recipient'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      defaultServices:
          (j['defaultServices'] as List?)?.map((e) => e.toString()).toList() ?? const [],
    );
  }
}

class TempleRegistryService {
  // Code -> human label. Mirrors SERVICE_LABEL in pdf.controller.ts.
  static const Map<String, String> serviceLabels = {
    'SPECIAL_DARSHAN': 'Special Darshan',
    'DARSHAN': 'Darshan',
    'SPARSH_DARSHAN': 'Sparsh Darshan',
    'MANGALARATI': 'Mangalarati',
    'BHASMARATI': 'Bhasmarati',
    'POOJA': 'Pooja',
    'ACCOMMODATION': 'Accommodation',
  };

  static List<TempleEntry>? _cache;

  /// Fetch the temple registry, cached after first call.
  ///
  /// On failure, throws an [Exception] whose message includes the HTTP
  /// status (and a short body snippet when the server returned a message)
  /// so the create page can render something diagnosable instead of a
  /// generic "Could not load temples".
  static Future<List<TempleEntry>> fetch() async {
    if (_cache != null) return _cache!;

    final http.Response res;
    try {
      res = await HttpService.get('/api/pdf/temple-registry');
    } catch (e) {
      throw Exception('Network error: $e');
    }

    if (res.statusCode != 200) {
      String detail = 'HTTP ${res.statusCode}';
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map && decoded['message'] is String) {
          detail = '$detail — ${decoded['message']}';
        } else if (res.body.isNotEmpty) {
          final snippet =
              res.body.length > 80 ? '${res.body.substring(0, 80)}…' : res.body;
          detail = '$detail — $snippet';
        }
      } catch (_) {
        // Body wasn't JSON — keep the bare status code.
      }
      throw Exception('Failed to load temples ($detail)');
    }

    final dynamic decoded;
    try {
      decoded = jsonDecode(res.body);
    } catch (e) {
      throw Exception('Invalid server response: $e');
    }
    final data = decoded is Map<String, dynamic>
        ? (decoded['data'] ?? decoded)
        : decoded;
    final temples = (data is Map ? data['temples'] : null) as List? ?? const [];
    _cache = temples
        .map((t) => TempleEntry.fromJson(t as Map<String, dynamic>))
        .toList();
    return _cache!;
  }

  /// Download the Darshan letter PDF for a grievance and open it. The backend
  /// atomically marks the grievance RESOLVED + LETTER_GENERATED once the PDF
  /// bytes are streamed, so calling this also auto-resolves the grievance.
  ///
  /// Returns the path to the saved file on success, or throws on failure.
  static Future<String> downloadDarshanLetter(String grievanceId) async {
    final res = await HttpService.downloadFile(
      '/api/pdf/grievance/$grievanceId/temple-visit',
    );
    if (res.statusCode != 200) {
      throw Exception('PDF download failed (${res.statusCode})');
    }
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/Darshan_Letter_$grievanceId.pdf');
    await file.writeAsBytes(res.bodyBytes);
    await OpenFilex.open(file.path);
    return file.path;
  }
}
