import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../widgets/cupertino/cupertino_toast.dart';

/// Small helper mirroring the web's "Export CSV" buttons. Builds a CSV file
/// from a header row + data rows, writes it to a temp file and opens it with
/// the platform's default handler.
class CsvExport {
  /// Platform-safe feedback: Material pages have a [ScaffoldMessenger]; pure
  /// Cupertino pages don't, so fall back to a [CupertinoToast]. This lets the
  /// same export button work on both Material and Cupertino screens.
  static void _notify(BuildContext context, String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    } else {
      CupertinoToast.show(context, message);
    }
  }
  /// Escapes a single CSV cell (quotes, commas, newlines).
  static String _cell(Object? value) {
    final s = value?.toString() ?? '';
    if (s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r')) {
      return '"${s.replaceAll('"', '""')}"';
    }
    return s;
  }

  /// Build CSV text from headers + rows.
  static String build(List<String> headers, List<List<Object?>> rows) {
    final buffer = StringBuffer();
    buffer.writeln(headers.map(_cell).join(','));
    for (final row in rows) {
      buffer.writeln(row.map(_cell).join(','));
    }
    return buffer.toString();
  }

  /// Build the CSV, write it to `<fileName>.csv` and open it. Shows a snackbar
  /// on the given context to report success/failure.
  static Future<void> export(
    BuildContext context, {
    required String fileName,
    required List<String> headers,
    required List<List<Object?>> rows,
  }) async {
    if (rows.isEmpty) {
      _notify(context, 'Nothing to export');
      return;
    }
    try {
      final csv = build(headers, rows);
      final dir = await getTemporaryDirectory();
      final safeName = fileName.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
      final file = File('${dir.path}/$safeName.csv');
      await file.writeAsString(csv);
      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && context.mounted) {
        _notify(context, 'Saved CSV to ${file.path}');
      }
    } catch (e) {
      if (context.mounted) _notify(context, 'Export failed: $e');
    }
  }
}
