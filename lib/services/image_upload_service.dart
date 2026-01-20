import 'dart:io';
import 'dart:convert';
import 'dart:typed_data'; // ✅ ADD THIS
import 'package:flutter/foundation.dart' show kIsWeb; // ✅ ADD THIS
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import 'auth_service.dart';
import 'http_service.dart';

class ImageUploadService {
  // Existing method for mobile
  static Future<String> uploadImage(File imageFile) async {
    try {
      print('📤 Uploading image: ${imageFile.path}');
      print('📊 File size: ${imageFile.lengthSync()} bytes');

      final token = await AuthService.getToken();
      if (token == null) {
        throw Exception('No authentication token found');
      }

      final uri = Uri.parse('${HttpService.baseUrl}/upload/image');
      final request = http.MultipartRequest('POST', uri);

      // Add authorization header
      request.headers['Authorization'] = 'Bearer $token';

      // Determine MIME type
      final mimeType = lookupMimeType(imageFile.path) ?? 'image/jpeg';
      final mimeTypeData = mimeType.split('/');

      print('📷 MIME type: $mimeType');

      // Add image file
      final multipartFile = await http.MultipartFile.fromPath(
        'image',
        imageFile.path,
        contentType: MediaType(mimeTypeData[0], mimeTypeData[1]),
      );

      request.files.add(multipartFile);

      print('🚀 Sending upload request...');
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      print('✅ Upload response status: ${response.statusCode}');
      print('📦 Upload response body: ${response.body}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        final imageUrl = data['imageUrl'];
        print('✅ Image uploaded successfully: $imageUrl');
        return imageUrl;
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Upload failed');
      }
    } catch (e) {
      print('❌ Image upload error: $e');
      rethrow;
    }
  }

  // ✅ NEW: Add this method for web support
  static Future<String> uploadImageBytes(Uint8List imageBytes) async {
    try {
      print('📤 Uploading image from bytes (WEB)');
      print('📊 Bytes size: ${imageBytes.length} bytes');

      final token = await AuthService.getToken();
      if (token == null) {
        throw Exception('No authentication token found');
      }

      final uri = Uri.parse('${HttpService.baseUrl}/upload/image');
      final request = http.MultipartRequest('POST', uri);

      // Add authorization header
      request.headers['Authorization'] = 'Bearer $token';

      // Generate filename with timestamp
      final filename = 'image_${DateTime.now().millisecondsSinceEpoch}.png';

      print('📷 Generated filename: $filename');

      // ⚠️ CRITICAL: filename parameter is mandatory for web uploads
      final multipartFile = http.MultipartFile.fromBytes(
        'image',
        imageBytes,
        filename: filename, // This is essential!
        contentType: MediaType('image', 'png'),
      );

      request.files.add(multipartFile);

      print('🚀 Sending upload request...');
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      print('✅ Upload response status: ${response.statusCode}');
      print('📦 Upload response body: ${response.body}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        final imageUrl = data['imageUrl'];
        print('✅ Image uploaded successfully: $imageUrl');
        return imageUrl;
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Upload failed');
      }
    } catch (e) {
      print('❌ Image upload error: $e');
      rethrow;
    }
  }

  static Future<void> deleteImage(String filename) async {
    try {
      final response = await HttpService.delete('/upload/image/$filename');

      if (response.statusCode != 200) {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Delete failed');
      }
    } catch (e) {
      print('❌ Image delete error: $e');
      rethrow;
    }
  }
}
