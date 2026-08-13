import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show CircleAvatar;
import '../../theme/app_theme.dart';
import '../../utils/access_control.dart';
import '../../utils/app_navigator.dart';
import 'cupertino_page_header.dart';

/// Full-screen menu page replacing Material Drawer for iOS
class CupertinoNavMenu extends StatelessWidget {
  final String userName;
  final String role;
  final VoidCallback onLogout;
  final VoidCallback onToggleTheme;
  final bool isDark;

  /// How to dismiss the menu. Supplied when the menu is hosted as the root of
  /// the "More" bottom tab (there it should switch back to the Dashboard tab).
  /// When null the menu is a pushed route and simply pops itself.
  final VoidCallback? onClose;

  const CupertinoNavMenu({
    super.key,
    required this.userName,
    required this.role,
    required this.onLogout,
    required this.onToggleTheme,
    required this.isDark,
    this.onClose,
  });

  /// Closes the menu *before navigating somewhere else*. When the menu is a
  /// pushed route this pops it so the destination replaces it. When the menu
  /// is a bottom-tab root there is nothing to pop — popping would leave the
  /// tab blank — so it stays put and the destination is pushed on top of it,
  /// which is the correct tab behaviour (back returns to the menu).
  void _closeMenu(BuildContext context) {
    final navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
  }

  /// Dismisses the menu as an end in itself ("Close", "Dashboard"). As a tab
  /// root that means switching back to the Dashboard tab via [onClose].
  void _dismissMenu(BuildContext context) {
    if (onClose != null) {
      onClose!();
      return;
    }
    _closeMenu(context);
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = role == Roles.admin;
    final isStaff = role == Roles.staff;
    final isSuperAdmin = role == Roles.superAdmin;
    return CupertinoPageScaffold(
      child: Column(
        children: [
          OmsPageHeader(
            title: "Menu",
            leading: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => _dismissMenu(context),
              child: const Text(
                "Close",
                style: TextStyle(
                  inherit: false,
                  color: CupertinoColors.white,
                  fontSize: 17,
                  decoration: TextDecoration.none,
                ),
              ),
            ),
            showBack: false,
          ),
          Expanded(
            // Explicit padding: with none, ListView re-applies the status-bar
            // inset that OmsPageHeader has already consumed, opening an ~80pt
            // blank gap between the header and the first item. The bottom
            // inset keeps the last row clear of the home indicator.
            child: ListView(
              // `padding` (not `viewPadding`): CupertinoTabScaffold reports the
              // tab-bar inset through MediaQuery.padding, and zeroes it once it
              // has inset the content itself. viewPadding only ever covers the
              // home indicator, so the Logout button ended up behind the bar.
              padding: EdgeInsets.only(
                bottom: MediaQuery.paddingOf(context).bottom,
              ),
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
                        child: Icon(
                          CupertinoIcons.person_fill,
                          size: 30,
                          color: AppTheme.primaryIndigo,
                        ),
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
                                color: CupertinoColors.systemGrey5,
                                fontSize: 13,
                              ),
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
                      _closeMenu(context);
                      onLogout();
                    },
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          CupertinoIcons.square_arrow_right,
                          color: CupertinoColors.white,
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Logout',
                          style: TextStyle(color: CupertinoColors.white),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // SUPER_ADMIN: dashboard-only — drawer reduced to Dashboard + My Profile
  // (which hosts the Change Password card) + About Team + Logout.
  // (Logout button is rendered separately below the menu sections.)
  List<Widget> _buildSuperAdminMenu(BuildContext context) {
    return [
      CupertinoListSection.insetGrouped(
        children: [
          _menuTile(
            context,
            CupertinoIcons.square_grid_2x2_fill,
            'Dashboard',
            () => _dismissMenu(context),
          ),
          _menuTile(
            context,
            CupertinoIcons.person_crop_circle,
            'My Profile',
            () {
              _closeMenu(context);
              AppNavigator.toMyProfile(context);
            },
          ),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            _closeMenu(context);
            AppNavigator.toAbout(context);
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
          _menuTile(
            context,
            CupertinoIcons.square_grid_2x2_fill,
            'Dashboard',
            () => _dismissMenu(context),
          ),
          _menuTile(context, CupertinoIcons.checkmark_square, 'My Tasks', () {
            _closeMenu(context);
            AppNavigator.toStaffTasks(context);
          }),
          _menuTile(context, CupertinoIcons.list_bullet, 'All Tasks', () {
            _closeMenu(context);
            AppNavigator.toAllTasks(context, role: role);
          }),
          _menuTile(
            context,
            CupertinoIcons.tray_arrow_down,
            'Forwarded to Me',
            () {
              _closeMenu(context);
              AppNavigator.toForwardedTasks(context);
            },
          ),
          _menuTile(context, CupertinoIcons.calendar, 'My Attendance', () {
            _closeMenu(context);
            AppNavigator.toMyAttendance(context);
          }),
          _menuTile(context, CupertinoIcons.clock, 'My History', () {
            _closeMenu(context);
            AppNavigator.toStaffHistory(context);
          }),
          _menuTile(context, CupertinoIcons.doc_text, 'Grievance', () {
            _closeMenu(context);
            AppNavigator.toGrievanceEntry(context, role: role);
          }),
          _menuTile(
            context,
            CupertinoIcons.person_add,
            'Add Visitor/Birthday',
            () {
              _closeMenu(context);
              AppNavigator.toAddPerson(context);
            },
          ),
          _menuTile(context, CupertinoIcons.gift_fill, 'View Birthdays', () {
            _closeMenu(context);
            AppNavigator.toBirthdayView(context);
          }),
          _menuTile(
            context,
            CupertinoIcons.train_style_one,
            'Train EQ Request',
            () {
              _closeMenu(context);
              AppNavigator.toTrainRequestAdd(context, role: role);
            },
          ),
          _menuTile(
            context,
            CupertinoIcons.calendar_badge_plus,
            'Add Invitation',
            () {
              _closeMenu(context);
              AppNavigator.toInvitationAdd(context);
            },
          ),
          _menuTile(context, CupertinoIcons.star, 'Event Reports', () {
            _closeMenu(context);
            AppNavigator.toEventReports(context);
          }),
          _menuTile(context, CupertinoIcons.news, 'Add News', () {
            _closeMenu(context);
            AppNavigator.toNewsAdd(context);
          }),
          _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
            _closeMenu(context);
            AppNavigator.toPrintCenter(context);
          }),
          _menuTile(
            context,
            CupertinoIcons.person_crop_circle,
            'My Profile',
            () {
              _closeMenu(context);
              AppNavigator.toMyProfile(context);
            },
          ),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            _closeMenu(context);
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
          _menuTile(
            context,
            CupertinoIcons.square_grid_2x2_fill,
            'Dashboard',
            () => _dismissMenu(context),
          ),
          _menuTile(
            context,
            CupertinoIcons.chart_bar_alt_fill,
            'Task Tracker',
            () {
              _closeMenu(context);
              AppNavigator.toTaskList(context, role: role);
            },
          ),
          _menuTile(context, CupertinoIcons.list_bullet, 'All Tasks', () {
            _closeMenu(context);
            AppNavigator.toAllTasks(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.briefcase, 'Office Tasks', () {
            _closeMenu(context);
            AppNavigator.toOfficeTasks(context, role: role);
          }),
          _menuTile(
            context,
            CupertinoIcons.tray_arrow_down,
            'Forwarded to Me',
            () {
              _closeMenu(context);
              AppNavigator.toForwardedTasks(context);
            },
          ),
          _menuTile(
            context,
            CupertinoIcons.doc_text_search,
            'New Grievance',
            () {
              _closeMenu(context);
              AppNavigator.toOfficeGrievanceCreate(context);
            },
          ),
          _menuTile(
            context,
            CupertinoIcons.person_add,
            'Add Visitor/Birthday',
            () {
              _closeMenu(context);
              AppNavigator.toAddPerson(context);
            },
          ),
          _menuTile(context, CupertinoIcons.tram_fill, 'Train EQ Request', () {
            _closeMenu(context);
            AppNavigator.toTrainRequestAdd(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.map, 'Tour Program', () {
            _closeMenu(context);
            AppNavigator.toTourProgramCreate(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News Entry', () {
            _closeMenu(context);
            AppNavigator.toNewsAdd(context);
          }),
          _menuTile(
            context,
            CupertinoIcons.train_style_one,
            'Train EQ Queue',
            () {
              _closeMenu(context);
              AppNavigator.toTrainQueue(context);
            },
          ),
          _menuTile(
            context,
            CupertinoIcons.calendar_badge_plus,
            'Tour Invitations',
            () {
              _closeMenu(context);
              AppNavigator.toTourQueue(context);
            },
          ),
          _menuTile(context, CupertinoIcons.star, 'Events', () {
            _closeMenu(context);
            AppNavigator.toEvents(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'Calendar', () {
            _closeMenu(context);
            AppNavigator.toCalendar(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.group_solid, 'Meetings', () {
            _closeMenu(context);
            AppNavigator.toMeetings(context);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'View Visitors', () {
            _closeMenu(context);
            AppNavigator.toVisitorList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News Feed', () {
            _closeMenu(context);
            AppNavigator.toNewsList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
            _closeMenu(context);
            AppNavigator.toPrintCenter(context);
          }),
          _menuTile(context, CupertinoIcons.calendar, 'Staff Attendance', () {
            _closeMenu(context);
            AppNavigator.toStaffAttendance(context);
          }),
          _menuTile(context, CupertinoIcons.time, 'Action History', () {
            _closeMenu(context);
            AppNavigator.toActionHistory(context);
          }),
          _menuTile(
            context,
            CupertinoIcons.chart_bar_square,
            'Activity Log',
            () {
              _closeMenu(context);
              AppNavigator.toActivityLog(context);
            },
          ),
          _menuTile(context, CupertinoIcons.gift, 'View Birthdays', () {
            _closeMenu(context);
            AppNavigator.toBirthdayView(context);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'User Management', () {
            _closeMenu(context);
            AppNavigator.toUserManagement(context);
          }),
          _menuTile(
            context,
            CupertinoIcons.person_crop_circle,
            'My Profile',
            () {
              _closeMenu(context);
              AppNavigator.toMyProfile(context);
            },
          ),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            _closeMenu(context);
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
            _closeMenu(context);
            AppNavigator.toGrievanceList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.person_2, 'Visitors', () {
            _closeMenu(context);
            AppNavigator.toVisitorList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.gift, 'Birthdays', () {
            _closeMenu(context);
            AppNavigator.toBirthday(context, role: role);
          }),
          _menuTile(
            context,
            CupertinoIcons.train_style_one,
            'Train Requests',
            () {
              _closeMenu(context);
              AppNavigator.toTrainRequestList(context, role: role);
            },
          ),
          _menuTile(context, CupertinoIcons.calendar, 'Tour Programs', () {
            _closeMenu(context);
            AppNavigator.toTourProgramList(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.news, 'News & Intelligence', () {
            _closeMenu(context);
            AppNavigator.toNewsList(context, role: role);
          }),
        ],
      ),

      // Super-admin — full admin toolset
      if (role == Roles.superAdmin)
        CupertinoListSection.insetGrouped(
          header: const Text('ADMIN'),
          children: [
            _menuTile(
              context,
              CupertinoIcons.building_2_fill,
              'Office Grievance',
              () {
                _closeMenu(context);
                AppNavigator.toOfficeGrievanceCreate(context);
              },
            ),
            _menuTile(
              context,
              CupertinoIcons.train_style_one,
              'Train EQ Queue',
              () {
                _closeMenu(context);
                AppNavigator.toTrainQueue(context);
              },
            ),
            _menuTile(
              context,
              CupertinoIcons.calendar_badge_plus,
              'Tour Decisions',
              () {
                _closeMenu(context);
                AppNavigator.toTourQueue(context);
              },
            ),
            _menuTile(
              context,
              CupertinoIcons.checkmark_square,
              'Task Tracker',
              () {
                _closeMenu(context);
                AppNavigator.toTaskList(context, role: role);
              },
            ),
            _menuTile(context, CupertinoIcons.time, 'Action History', () {
              _closeMenu(context);
              AppNavigator.toActionHistory(context);
            }),
            _menuTile(context, CupertinoIcons.gift, 'View Birthdays', () {
              _closeMenu(context);
              AppNavigator.toBirthdayView(context);
            }),
            _menuTile(context, CupertinoIcons.printer, 'Print Center', () {
              _closeMenu(context);
              AppNavigator.toPrintCenter(context);
            }),
            _menuTile(context, CupertinoIcons.person_2, 'User Management', () {
              _closeMenu(context);
              AppNavigator.toUserManagement(context);
            }),
          ],
        ),

      // Staff section
      if (role == Roles.staff)
        CupertinoListSection.insetGrouped(
          header: const Text('MY WORK'),
          children: [
            _menuTile(context, CupertinoIcons.checkmark_square, 'My Tasks', () {
              _closeMenu(context);
              AppNavigator.toStaffTasks(context);
            }),
            _menuTile(context, CupertinoIcons.clock, 'My Submissions', () {
              _closeMenu(context);
              AppNavigator.toStaffHistory(context);
            }),
          ],
        ),

      // Settings (staff + super-admin only)
      CupertinoListSection.insetGrouped(
        header: const Text('SETTINGS'),
        children: [
          _menuTile(context, CupertinoIcons.clock, 'Activity History', () {
            _closeMenu(context);
            AppNavigator.toHistory(context, role: role);
          }),
          _menuTile(context, CupertinoIcons.lock, 'Change Password', () {
            _closeMenu(context);
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
                _closeMenu(context);
              },
            ),
          ),
          _menuTile(context, CupertinoIcons.group, 'About Team', () {
            _closeMenu(context);
            AppNavigator.toAbout(context);
          }),
        ],
      ),
    ];
  }

  Widget _menuTile(
    BuildContext context,
    IconData icon,
    String title,
    VoidCallback onTap,
  ) {
    return CupertinoListTile(
      leading: Icon(icon, color: AppTheme.primaryIndigo),
      title: Text(title),
      trailing: const CupertinoListTileChevron(),
      onTap: onTap,
    );
  }
}
