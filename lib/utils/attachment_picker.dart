import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'platform_utils.dart';

/// A picked document/image: the [file], its display [name] and [size] in bytes.
typedef PickedAttachment = ({File file, String name, int size});

enum _Source { files, camera }

/// Shared "attach a document" picker used everywhere the app uploads a file.
///
/// Presents a two-option chooser — **Gallery / Files** (photos + PDFs via
/// [FilePicker]) and **Camera** (capture a photo via [ImagePicker]) — then
/// returns the picked file, or `null` if the user cancels or the pick fails.
/// Platform-aware: a Cupertino action sheet on iOS, a Material bottom sheet
/// on Android.
class AttachmentPicker {
  static const List<String> defaultExtensions = [
    'pdf',
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
  ];

  static Future<PickedAttachment?> pick(
    BuildContext context, {
    List<String> allowedExtensions = defaultExtensions,
  }) async {
    final source = await _chooseSource(context);
    if (source == null) return null;

    File file;
    String name;

    if (source == _Source.camera) {
      final x = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );
      if (x == null) return null;
      file = File(x.path);
      name = x.name;
    } else {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: allowedExtensions,
      );
      if (result == null || result.files.isEmpty) return null;
      final pf = result.files.single;
      final path = pf.path;
      if (path == null) return null;
      file = File(path);
      name = pf.name;
    }

    final size = await file.length();
    return (file: file, name: name, size: size);
  }

  static Future<_Source?> _chooseSource(BuildContext context) {
    if (PlatformUtils.isCupertino) {
      return showCupertinoModalPopup<_Source>(
        context: context,
        builder: (ctx) => CupertinoActionSheet(
          title: const Text('Attach Document'),
          actions: [
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx, _Source.files),
              child: const Text('Gallery / Files'),
            ),
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx, _Source.camera),
              child: const Text('Camera'),
            ),
          ],
          cancelButton: CupertinoActionSheetAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
        ),
      );
    }
    return showModalBottomSheet<_Source>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Gallery / Files'),
              subtitle: const Text('Choose a photo or PDF'),
              onTap: () => Navigator.pop(ctx, _Source.files),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              subtitle: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, _Source.camera),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
