import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show CircleAvatar;
import '../../theme/app_theme.dart';
import '../../utils/access_control.dart';
import '../../utils/app_navigator.dart';

/// Full-screen menu page replacing Material Drawer for iOS
class CupertinoNavMenu extends StatelessWidget {
  final String userName;
  final String role;
  final VoidCallback onLogout;
  final VoidCallback onToggleTheme;
  final bool isDark;

  const CupertinoNavMenu({
    super.key,
    required this.userName,
    required this.role,
    required this.onLogout,
    required this.onToggleTheme,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final isAdmin = role == Roles.admin;
    final isStaff = role == Roles.staff;
    final isSuperAdmin = role == Roles.superAdmin;
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: const Text('Menu'),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          child: const Text('Close'),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      child: SafeArea(
        child: ListView(
          children: [
            // User profile header
            Container(
              padding: const EdgeInsets.all(20),
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 28,
                    backgroundColor: CupertinoColors.white,
                    child: Icon(CupertinoIcons.person_fill,
                        size: 30, color: AppTheme.primaryIndigo),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          userName,
                          style: const TextStyle(
                            color: CupertinoColors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Role: $role",
                          style: const TextStyle(
                              color: CupertinoColors.systemGrey5, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (isSuperAdmin)
              ..._buildSuperAdminMenu(context)
            else if (isAdmin)
              ..._buildAdminMenu(context)
            else if (isStaff)
              ..._buildStaffMenu(context)
            else
              ..._buildDefaultMenu(context),

            // Logout
            Padding(
              padding: const EdgeInsets.all(16),
              child: CupertinoButton(
                color: AppTheme.destructiveRed,
                onPressed: () {
                  Navigator.pop(context);
                  onLogout();
                },
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.square_arrow_right,
                        color: CupertinoColors.white),
                    SizedBox(width: 8),
                    Text('Logout',
                        style: TextStyle(color: CupertinoColors.white)),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  // SUPER_ADMIN: dashboard-only — drawer reduced to Dashboard + My Profile
  // (which hosts the Change Password card) + Logout.
  // (Logout button is rendered separately below the menu sections.)
  List<Widget> _buildSuperAdminMenu(BuildContext context) {
    return [
      CupertinoListSection.insetGrouped(
        children: [
          _menuTile(context, CupertinoIcons.square_grid_2x2_fill, 'Dashboard',
              () => Navigator.pop(context)),
          _menuTile(context, CupertinoIcons.person_crop_circle, 'My Profile',
              () {
            Navigator.pop(context);
            AppNavigator.toMyProfile(context);
          }),
        ],
      ),
    ];
  }

  // Curated staff menu — only the items shown in the spec.
  List<Widget> _buildStaffMenu(BuildContext context) {
    return [
      CupertinoListSection.insetGrouped(
        children: [
          _menuTile(context, CupertinoIcons.square_grid_2x2_fill, 'Dashboard',
              () => Navigator.pop(context)),
          _menuTile(
              context, CupertinoIcons.checkmark_square, 'My Tasks', () {
            Navigator.pop(context);
            AppNavigator.toStaffTasks(context);
          }),
          _menuTile(context, CupertinoIcons.list_bullet, 'All Tasks', () {
            Navigator.pop(context);
            AppNavigator.toAllTasks(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.tray_arrow_down, 'Forwarded to Me',
              () {
            Navigator.pop(context);
            AppNavigator.toForwardedTasks(context);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'My Attendance', () {
            Navigator.pop(context);
            AppNavigator.toMyAttendance(context);
          }),
          _menuTile(context, CupertinoIcons.clock, 'My History', () {
            Navigator.pop(context);
            AppNavigator.toStaffHistory(context);
          }),
          _menuTile(context, CupertinoIcons.doc_text, 'Grievance', () {
            Navigator.pop(context);
            AppNavigator.toGrievanceEntry(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.person_add, 'Add Visitor/Birthday',
              () {
            Navigator.pop(context);
            AppNavigator.toAddPerson(context);
          }),
          _menuTile(context, CupertinoIcons.gift_fill, 'View Birthdays', () {
            Navigator.pop(context);
            AppNavigator.toBirthdayView(context);
          }),
          _menuTile(
              context, CupertinoIcons.train_style_one, 'Train EQ Request',
              () {
            Navigator.pop(context);
            AppNavigator.toTrainRequestAdd(context, role: role);
          }),
          _menuTile(
              context, CupertinoIcons.calendar_badge_plus, 'Add Invitation',
              () {
            Navigator.pop(context);
            AppNavigator.toInvitationAdd(context);
          }),
          _menuTile(context, CupertinoIcons.star, 'Event Reports', () {
            Navigator.pop(context);
            AppNavigator.toEventReports(context);
          }),
          _menuTile(context, CupertinoIcons.news, 'Add News', () {
            Navigator.pop(context);
            AppNavigator.toNewsAdd(context);
          }),
          _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
            Navigator.pop(context);
            AppNavigator.toPrintCenter(context);
          }),
          _menuTile(context, CupertinoIcons.person_crop_circle, 'My Profile',
              () {
            Navigator.pop(context);
            AppNavigator.toMyProfile(context);
          }),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            Navigator.pop(context);
            AppNavigator.toAbout(context);
          }),
        ],
      ),
    ];
  }

  // Curated admin menu — only the items shown in the spec.
  List<Widget> _buildAdminMenu(BuildContext context) {
    return [
      CupertinoListSection.insetGrouped(
        children: [
          _menuTile(context, CupertinoIcons.square_grid_2x2_fill, 'Dashboard',
              () => Navigator.pop(context)),
          _menuTile(
              context, CupertinoIcons.chart_bar_alt_fill, 'Task Tracker', () {
            Navigator.pop(context);
            AppNavigator.toTaskList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.list_bullet, 'All Tasks', () {
            Navigator.pop(context);
            AppNavigator.toAllTasks(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.briefcase, 'Office Tasks', () {
            Navigator.pop(context);
            AppNavigator.toOfficeTasks(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.tray_arrow_down, 'Forwarded to Me',
              () {
            Navigator.pop(context);
            AppNavigator.toForwardedTasks(context);
          }),
          _menuTile(context, CupertinoIcons.doc_text_search, 'New Grievance',
              () {
            Navigator.pop(context);
            AppNavigator.toOfficeGrievanceCreate(context);
          }),
          _menuTile(context, CupertinoIcons.person_add, 'Add Visitor/Birthday',
              () {
            Navigator.pop(context);
            AppNavigator.toAddPerson(context);
          }),
          _menuTile(context, CupertinoIcons.tram_fill, 'Train EQ Request', () {
            Navigator.pop(context);
            AppNavigator.toTrainRequestAdd(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.map, 'Tour Program', () {
            Navigator.pop(context);
            AppNavigator.toTourProgramCreate(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News Entry', () {
            Navigator.pop(context);
            AppNavigator.toNewsAdd(context);
          }),
          _menuTile(
              context, CupertinoIcons.train_style_one, 'Train EQ Queue', () {
            Navigator.pop(context);
            AppNavigator.toTrainQueue(context);
          }),
          _menuTile(
              context, CupertinoIcons.calendar_badge_plus, 'Tour Invitations',
              () {
            Navigator.pop(context);
            AppNavigator.toTourQueue(context);
          }),
          _menuTile(context, CupertinoIcons.star, 'Events', () {
            Navigator.pop(context);
            AppNavigator.toEvents(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'Calendar', () {
            Navigator.pop(context);
            AppNavigator.toCalendar(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.group_solid, 'Meetings', () {
            Navigator.pop(context);
            AppNavigator.toMeetings(context);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'View Visitors', () {
            Navigator.pop(context);
            AppNavigator.toVisitorList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News Feed', () {
            Navigator.pop(context);
            AppNavigator.toNewsList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
            Navigator.pop(context);
            AppNavigator.toPrintCenter(context);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'Staff Attendance', () {
            Navigator.pop(context);
            AppNavigator.toStaffAttendance(context);
          }),
          _menuTile(context, CupertinoIcons.time, 'Action History', () {
            Navigator.pop(context);
            AppNavigator.toActionHistory(context);
          }),
          _menuTile(context, CupertinoIcons.chart_bar_square, 'Activity Log',
              () {
            Navigator.pop(context);
            AppNavigator.toActivityLog(context);
          }),
          _menuTile(context, CupertinoIcons.gift, 'View Birthdays', () {
            Navigator.pop(context);
            AppNavigator.toBirthdayView(context);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'User Management', () {
            Navigator.pop(context);
            AppNavigator.toUserManagement(context);
          }),
          _menuTile(context, CupertinoIcons.person_crop_circle, 'My Profile',
              () {
            Navigator.pop(context);
            AppNavigator.toMyProfile(context);
          }),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            Navigator.pop(context);
            AppNavigator.toAbout(context);
          }),
        ],
      ),
    ];
  }

  // Default menu for staff and super-admin (unchanged behaviour).
  List<Widget> _buildDefaultMenu(BuildContext context) {
    return [
      // General section
      CupertinoListSection.insetGrouped(
        header: const Text('GENERAL'),
        children: [
          _menuTile(context, CupertinoIcons.doc_text, 'Public Grievance', () {
            Navigator.pop(context);
            AppNavigator.toGrievanceList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'Visitors', () {
            Navigator.pop(context);
            AppNavigator.toVisitorList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.gift, 'Birthdays', () {
            Navigator.pop(context);
            AppNavigator.toBirthday(context, role: role);
          }),
          _menuTile(
              context, CupertinoIcons.train_style_one, 'Train Requests', () {
            Navigator.pop(context);
            AppNavigator.toTrainRequestList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'Tour Programs', () {
            Navigator.pop(context);
            AppNavigator.toTourProgramList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News & Intelligence', () {
            Navigator.pop(context);
            AppNavigator.toNewsList(context, role: role);
          }),
        ],
      ),

      // Super-admin — full admin toolset
      if (role == Roles.superAdmin)
        CupertinoListSection.insetGrouped(
          header: const Text('ADMIN'),
          children: [
            _menuTile(context, CupertinoIcons.building_2_fill,
                'Office Grievance', () {
              Navigator.pop(context);
              AppNavigator.toOfficeGrievanceCreate(context);
            }),
            _menuTile(
                context, CupertinoIcons.train_style_one, 'Train EQ Queue', () {
              Navigator.pop(context);
              AppNavigator.toTrainQueue(context);
            }),
            _menuTile(context, CupertinoIcons.calendar_badge_plus,
                'Tour Decisions', () {
              Navigator.pop(context);
              AppNavigator.toTourQueue(context);
            }),
            _menuTile(
                context, CupertinoIcons.checkmark_square, 'Task Tracker', () {
              Navigator.pop(context);
              AppNavigator.toTaskList(context, role: role);
            }),
            _menuTile(context, CupertinoIcons.time, 'Action History', () {
              Navigator.pop(context);
              AppNavigator.toActionHistory(context);
            }),
            _menuTile(context, CupertinoIcons.gift, 'View Birthdays', () {
              Navigator.pop(context);
              AppNavigator.toBirthdayView(context);
            }),
            _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
              Navigator.pop(context);
              AppNavigator.toPrintCenter(context);
            }),
            _menuTile(
                context, CupertinoIcons.person_2, 'User Management', () {
              Navigator.pop(context);
              AppNavigator.toUserManagement(context);
            }),
          ],
        ),

      // Staff section
      if (role == Roles.staff)
        CupertinoListSection.insetGrouped(
          header: const Text('MY WORK'),
          children: [
            _menuTile(
                context, CupertinoIcons.checkmark_square, 'My Tasks', () {
              Navigator.pop(context);
              AppNavigator.toStaffTasks(context);
            }),
            _menuTile(context, CupertinoIcons.clock, 'My Submissions', () {
              Navigator.pop(context);
              AppNavigator.toStaffHistory(context);
            }),
          ],
        ),

      // Settings (staff + super-admin only)
      CupertinoListSection.insetGrouped(
        header: const Text('SETTINGS'),
        children: [
          _menuTile(context, CupertinoIcons.clock, 'Activity History', () {
            Navigator.pop(context);
            AppNavigator.toHistory(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.lock, 'Change Password', () {
            Navigator.pop(context);
            AppNavigator.toChangePassword(context);
          }),
          CupertinoListTile(
            leading: Icon(
              isDark ? CupertinoIcons.sun_max : CupertinoIcons.moon,
              color: AppTheme.primaryIndigo,
            ),
            title: Text(isDark ? 'Light Mode' : 'Dark Mode'),
            trailing: CupertinoSwitch(
              value: isDark,
              onChanged: (_) {
                onToggleTheme();
                Navigator.pop(context);
              },
            ),
          ),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            Navigator.pop(context);
            AppNavigator.toAbout(context);
          }),
        ],
      ),
    ];
  }

  Widget _menuTile(
      BuildContext context, IconData icon, String title, VoidCallback onTap) {
    return CupertinoListTile(
      leading: Icon(icon, color: AppTheme.primaryIndigo),
      title: Text(title),
      trailing: const CupertinoListTileChevron(),
      onTap: onTap,
    );
  }
}
