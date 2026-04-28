// import 'dart:convert';
// import 'package:flutter/cupertino.dart';
// import 'package:http/http.dart' as http;
// import '../../home/cupertino/cupertino_home_screen.dart';

// class CupertinoOtpScreen extends StatefulWidget {
//   const CupertinoOtpScreen({super.key, this.email});

//   final String? email;

//   @override
//   State<CupertinoOtpScreen> createState() => _CupertinoOtpScreenState();
// }

// class _CupertinoOtpScreenState extends State<CupertinoOtpScreen> {
//   final List<TextEditingController> _controllers =
//       List<TextEditingController>.generate(6, (_) => TextEditingController());
//   final List<FocusNode> _nodes =
//       List<FocusNode>.generate(6, (_) => FocusNode());

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
//       CupertinoToast.show(context, 'Please enter complete OTP', isError: true);
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
//         CupertinoToast.show(context, 'OTP verified successfully!');

//         if (mounted) {
//           Navigator.pushReplacement(
//             context,
//             CupertinoPageRoute(
//               builder: (context) =>
//                   CupertinoHomeScreen(userName: widget.email ?? 'User'),
//             ),
//           );
//         }
//       } else {
//         final error = jsonDecode(response.body);
//         CupertinoToast.show(
//             context, error['message'] ?? 'Invalid OTP', isError: true);
//       }
//     } catch (e) {
//       setState(() => _submitting = false);
//       CupertinoToast.show(context, 'Something went wrong: $e', isError: true);
//     }
//   }

//   @override
//   Widget build(BuildContext context) {
//     return CupertinoPageScaffold(
//       backgroundColor: const Color(0xFFF6F7FB),
//       child: SafeArea(
//         child: SingleChildScrollView(
//           padding: const EdgeInsets.symmetric(horizontal: 16),
//           child: Column(
//             children: <Widget>[
//               const SizedBox(height: 24),
//               const SizedBox(height: 16),
//               Container(
//                 width: double.infinity,
//                 padding: const EdgeInsets.all(16),
//                 decoration: BoxDecoration(
//                   color: CupertinoColors.white,
//                   borderRadius: BorderRadius.circular(12),
//                   border: Border.all(color: const Color(0xFFE6E6E6)),
//                   boxShadow: [
//                     BoxShadow(
//                       color: CupertinoColors.black.withOpacity(0.05),
//                       blurRadius: 12,
//                       offset: const Offset(0, 4),
//                     ),
//                   ],
//                 ),
//                 child: Column(
//                   children: <Widget>[
//                     const Text(
//                       'Email OTP\nVerification',
//                       textAlign: TextAlign.center,
//                       style: TextStyle(
//                         fontSize: 22,
//                         fontWeight: FontWeight.w700,
//                       ),
//                     ),
//                     const SizedBox(height: 8),
//                     const Text(
//                       'Please ensure that the email id mentioned is valid\nas we have sent an OTP to your email.',
//                       textAlign: TextAlign.center,
//                       style: TextStyle(
//                         fontSize: 14,
//                         color: CupertinoColors.systemGrey,
//                       ),
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
//                                 color: CupertinoColors.black.withOpacity(0.05),
//                                 blurRadius: 6,
//                                 offset: const Offset(0, 3),
//                               ),
//                             ],
//                           ),
//                           child: CupertinoTextField(
//                             controller: _controllers[i],
//                             focusNode: _nodes[i],
//                             textAlign: TextAlign.center,
//                             keyboardType: TextInputType.number,
//                             maxLength: 1,
//                             decoration: const BoxDecoration(),
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
//                       style:
//                           const TextStyle(color: CupertinoColors.systemGrey),
//                     ),
//                     const SizedBox(height: 20),
//                     RichText(
//                       text: const TextSpan(
//                         style: TextStyle(
//                           fontSize: 14,
//                           color: CupertinoColors.black,
//                         ),
//                         children: [
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
//                       child: CupertinoButton.filled(
//                         borderRadius: BorderRadius.circular(12),
//                         onPressed: _submitting ? null : _verify,
//                         child: _submitting
//                             ? const CupertinoActivityIndicator(
//                                 color: CupertinoColors.white)
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
