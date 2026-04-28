import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_theme.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  static const List<Map<String, String>> _teamMembers = [
    {
      'name': 'Dr. Manjunath K. Vanhalli',
      'role': 'Mentor & Guide',
      'description': 'Providing guidance and mentorship for the project development and implementation.',
      'linkedin': 'https://www.linkedin.com/in/manjunath-vanhalli',
    },
    {
      'name': 'Shree Vats',
      'role': 'Team Leader, Backend Developer',
      'description': 'Leading the team and developing the backend infrastructure with Node.js and PostgreSQL.',
      'linkedin': 'https://www.linkedin.com/in/shreevats',
    },
    {
      'name': 'Atharva Agrawal',
      'role': 'Frontend Developer',
      'description': 'Building the web frontend with React, Tailwind CSS, and modern UI/UX patterns.',
      'linkedin': 'https://www.linkedin.com/in/atharvaagrawal',
    },
    {
      'name': 'Om Pandey',
      'role': 'Mobile/App Developer',
      'description': 'Developing the Flutter mobile application for Android and iOS platforms.',
      'linkedin': 'https://www.linkedin.com/in/ompandey',
    },
  ];

  Future<void> _openLinkedIn(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("About Us"),
        backgroundColor: AppTheme.primaryIndigo,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // App info card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppTheme.shadowMd,
              ),
              child: Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.business, size: 36, color: Colors.white),
                  ),
                  const SizedBox(height: 16),
                  const Text("Office Management System",
                      style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  const Text("OMS v1.0",
                      style: TextStyle(color: Colors.white70, fontSize: 14)),
                  const SizedBox(height: 12),
                  const Text(
                    "A comprehensive digital solution for managing government office operations including grievances, visitors, tour programs, and more.",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Vision card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: AppTheme.shadowSm,
                border: Border.all(color: AppTheme.primaryIndigo.withOpacity(0.1)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.lightbulb, color: AppTheme.saffron, size: 24),
                      const SizedBox(width: 10),
                      const Text("Our Vision", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    "We believe in leveraging technology for transparency and efficiency in government operations. "
                    "Our team is committed to building tools that simplify workflows, improve accountability, "
                    "and enhance public service delivery.",
                    style: TextStyle(fontSize: 14, color: Colors.grey.shade700, height: 1.6),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Team section
            const Text("Our Team", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),

            ..._teamMembers.map((member) => _buildTeamCard(member)),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamCard(Map<String, String> member) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AppTheme.primaryIndigo.withOpacity(0.1),
            child: Text(
              member['name']!.split(' ').map((w) => w[0]).take(2).join(),
              style: const TextStyle(color: AppTheme.primaryIndigo, fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(member['name']!, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                const SizedBox(height: 2),
                Text(member['role']!,
                    style: TextStyle(fontSize: 12, color: AppTheme.primaryIndigo, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Text(member['description']!,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4)),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => _openLinkedIn(member['linkedin']!),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.link, size: 14, color: Colors.blue.shade700),
                      const SizedBox(width: 4),
                      Text("Connect on LinkedIn",
                          style: TextStyle(fontSize: 12, color: Colors.blue.shade700, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
