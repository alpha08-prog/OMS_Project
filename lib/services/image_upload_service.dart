import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import 'auth_service.dart';
import 'http_service.dart';

class ImageUploadService {
  static Future<String> uploadImage(File imageFile) async {
    final token = await AuthService.getToken();
    if (token == null) {
      throw Exception('No authentication token found');
    }

    final uri = Uri.parse('${HttpService.baseUrl}/upload/image');
    final request = http.MultipartRequest('POST', uri);
    request.headers['Authorization'] = 'Bearer $token';

    final mimeType = lookupMimeType(imageFile.path) ?? 'image/jpeg';
    final mimeTypeData = mimeType.split('/');

    final multipartFile = await http.MultipartFile.fromPath(
      'image',
      imageFile.path,
      contentType: MediaType(mimeTypeData[0], mimeTypeData[1]),
    );
    request.files.add(multipartFile);

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = jsonDecode(response.body);
      return data['imageUrl'];
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['message'] ?? 'Upload failed');
    }
  }

  static Future<String> uploadImageBytes(Uint8List imageBytes) async {
    final token = await AuthService.getToken();
    if (token == null) {
      throw Exception('No authentication token found');
    }

    final uri = Uri.parse('${HttpService.baseUrl}/upload/image');
    final request = http.MultipartRequest('POST', uri);
    request.headers['Authorization'] = 'Bearer $token';

    final filename = 'image_${DateTime.now().millisecondsSinceEpoch}.png';

    // filename parameter is mandatory for web uploads
    final multipartFile = http.MultipartFile.fromBytes(
      'image',
      imageBytes,
      filename: filename,
      contentType: MediaType('image', 'png'),
    );
    request.files.add(multipartFile);

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = jsonDecode(response.body);
      return data['imageUrl'];
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['message'] ?? 'Upload failed');
    }
  }

  static Future<void> deleteImage(String filename) async {
    final response = await HttpService.delete('/upload/image/$filename');

    if (response.statusCode != 200) {
      final error = jsonDecode(response.body);
      throw Exception(error['message'] ?? 'Delete failed');
    }
  }
}
