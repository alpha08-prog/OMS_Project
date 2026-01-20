// import 'dart:convert';
// import 'package:flutter/material.dart';
// import 'package:http/http.dart' as http;
// import '../home/home_screen.dart';

// class OtpScreen extends StatefulWidget {
//   const OtpScreen({super.key, this.email});

//   final String? email;

//   @override
//   State<OtpScreen> createState() => _OtpScreenState();
// }

// class _OtpScreenState extends State<OtpScreen> {
//   final List<TextEditingController> _controllers =
//       List<TextEditingController>.generate(6, (_) => TextEditingController());
//   final List<FocusNode> _nodes = List<FocusNode>.generate(6, (_) => FocusNode());

//   bool _submitting = false;

//   @override
//   void dispose() {
//     for (final c in _controllers) {
//       c.dispose();
//     }
//     for (final n in _nodes) {
//       n.dispose();
//     }
//     super.dispose();
//   }

//   String get _otp => _controllers.map((c) => c.text).join();

//   Future<void> _verify() async {
//     if (_otp.length != 6 || widget.email == null) {
//       ScaffoldMessenger.of(context).showSnackBar(
//         const SnackBar(content: Text('Please enter complete OTP')),
//       );
//       return;
//     }

//     setState(() => _submitting = true);
//     try {
//       final response = await http.post(
//         Uri.parse('http://13.60.214.88:5000/api/auth/verify-otp'),
//         headers: {'Content-Type': 'application/json'},
//         body: jsonEncode({"email": widget.email, "otp": _otp}),
//       );

//       setState(() => _submitting = false);

//       if (response.statusCode == 200) {
//         ScaffoldMessenger.of(context).showSnackBar(
//           const SnackBar(content: Text('OTP verified successfully!')),
//         );

//         // Navigate to Login
//         if (mounted) {
//           Navigator.pushReplacement(
//             context,
//             MaterialPageRoute(
//               builder: (context) => HomeScreen(userName: widget.email ?? 'User'),
//             ),
//           );
//         }
//       } else {
//         final error = jsonDecode(response.body);
//         ScaffoldMessenger.of(context).showSnackBar(
//           SnackBar(
//             content: Text(error['message'] ?? 'Invalid OTP'),
//             backgroundColor: Colors.redAccent,
//           ),
//         );
//       }
//     } catch (e) {
//       setState(() => _submitting = false);
//       ScaffoldMessenger.of(context).showSnackBar(
//         SnackBar(content: Text('Something went wrong: $e')),
//       );
//     }
//   }

//   @override
//   Widget build(BuildContext context) {
//     return Scaffold(
//       backgroundColor: const Color(0xFFF6F7FB),
//       body: SafeArea(
//         child: SingleChildScrollView(
//           padding: const EdgeInsets.symmetric(horizontal: 16),
//           child: Column(
//             children: <Widget>[
//               const SizedBox(height: 24),
//               // SizedBox(
//               //   height: 80,
//               //   child: Center(
//               //     child: Image.asset("assets/images/image.png", height: 64),
//               //   ),
//               // ),
//               const SizedBox(height: 16),
//               Container(
//                 width: double.infinity,
//                 padding: const EdgeInsets.all(16),
//                 decoration: BoxDecoration(
//                   color: Colors.white,
//                   borderRadius: BorderRadius.circular(12),
//                   border: Border.all(color: const Color(0xFFE6E6E6)),
//                   boxShadow: [
//                     BoxShadow(
//                       color: Colors.black.withOpacity(0.05),
//                       blurRadius: 12,
//                       offset: const Offset(0, 4),
//                     ),
//                   ],
//                 ),
//                 child: Column(
//                   children: <Widget>[
//                     Text(
//                       'Email OTP\nVerification',
//                       textAlign: TextAlign.center,
//                       style: Theme.of(context)
//                           .textTheme
//                           .headlineSmall
//                           ?.copyWith(fontWeight: FontWeight.w700),
//                     ),
//                     const SizedBox(height: 8),
//                     Text(
//                       'Please ensure that the email id mentioned is valid\nas we have sent an OTP to your email.',
//                       textAlign: TextAlign.center,
//                       style: Theme.of(context)
//                           .textTheme
//                           .bodyMedium
//                           ?.copyWith(color: Colors.black54),
//                     ),
//                     const SizedBox(height: 24),
//                     Row(
//                       mainAxisAlignment: MainAxisAlignment.spaceBetween,
//                       children: List.generate(6, (i) {
//                         return Container(
//                           width: 48,
//                           height: 56,
//                           decoration: BoxDecoration(
//                             color: const Color(0xFFF6F7FB),
//                             borderRadius: BorderRadius.circular(10),
//                             border: Border.all(
//                               color: const Color(0xFF2563EB),
//                               width: 1.2,
//                             ),
//                             boxShadow: [
//                               BoxShadow(
//                                 color: Colors.black.withOpacity(0.05),
//                                 blurRadius: 6,
//                                 offset: const Offset(0, 3),
//                               ),
//                             ],
//                           ),
//                           child: TextField(
//                             controller: _controllers[i],
//                             focusNode: _nodes[i],
//                             textAlign: TextAlign.center,
//                             keyboardType: TextInputType.number,
//                             maxLength: 1,
//                             decoration: const InputDecoration(
//                               counterText: '',
//                               border: InputBorder.none,
//                             ),
//                             onChanged: (v) {
//                               if (v.isNotEmpty && i < 5) {
//                                 _nodes[i + 1].requestFocus();
//                               } else if (v.isEmpty && i > 0) {
//                                 _nodes[i - 1].requestFocus();
//                               }
//                             },
//                           ),
//                         );
//                       }),
//                     ),
//                     const SizedBox(height: 20),
//                     Text(
//                       widget.email ?? '',
//                       style: const TextStyle(color: Colors.black54),
//                     ),
//                     const SizedBox(height: 20),
//                     RichText(
//                       text: TextSpan(
//                         style: Theme.of(context)
//                             .textTheme
//                             .bodyMedium
//                             ?.copyWith(color: Colors.black87),
//                         children: const [
//                           TextSpan(text: "Didn't receive OTP code? "),
//                           TextSpan(
//                             text: 'Resend OTP',
//                             style: TextStyle(
//                               color: Color(0xFF2563EB),
//                               fontWeight: FontWeight.bold,
//                             ),
//                           ),
//                         ],
//                       ),
//                     ),
//                     const SizedBox(height: 20),
//                     SizedBox(
//                       width: double.infinity,
//                       height: 50,
//                       child: FilledButton(
//                         style: FilledButton.styleFrom(
//                           backgroundColor: const Color(0xFF2563EB),
//                           shape: RoundedRectangleBorder(
//                             borderRadius: BorderRadius.circular(12),
//                           ),
//                         ),
//                         onPressed: _submitting ? null : _verify,
//                         child: _submitting
//                             ? const SizedBox(
//                                 width: 16,
//                                 height: 16,
//                                 child: CircularProgressIndicator(
//                                   strokeWidth: 2,
//                                   color: Colors.white,
//                                 ),
//                               )
//                             : const Text(
//                                 'Verify',
//                                 style: TextStyle(
//                                   fontWeight: FontWeight.bold,
//                                   fontSize: 16,
//                                 ),
//                               ),
//                       ),
//                     ),
//                   ],
//                 ),
//               ),
//               const SizedBox(height: 24),
//             ],
//           ),
//         ),
//       ),
//     );
//   }
// }
