<?php
/**
 * Plugin Name: مسنجر ساده (Simple Messenger)
 * Description: چت خصوصی بین اعضای سایت با ظاهر شبیه تلگرام. فقط کاربران واردشده می‌توانند از مسنجر استفاده کنند. سازگار با ورود پیامکی پینوا. شورت‌کد: [simple_messenger]
 * Version: 1.2.3
 * Author: Your Name
 * Text Domain: simple-messenger
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SMSG_VERSION', '1.2.3' );
define( 'SMSG_URL', plugin_dir_url( __FILE__ ) );

final class SMSG_Plugin {

	const OPT = 'smsg_settings';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'smsg_messages';
	}

	public static function defaults() {
		return array(
			'login_url'      => '',
			'register_url'   => '',
			'redirect_login' => 0,
			'poll_interval'  => 4,
			'max_length'     => 1000,
			'max_file_mb'    => 10,
			'max_video_mb'   => 30,
			'max_music_mb'   => 20,
			'block_mode'     => 'error',
			'neshan_key'     => '',
			'map_link'       => 'geo:{lat},{lng}',
			'chat_bg_image'  => '', // تصویر پس‌زمینهٔ پیش‌فرض چت
			'chat_bg_color'  => '', // رنگ پس‌زمینه (اگر تصویر انتخاب نشده باشد)
		);
	}

	public static function settings() {
		return wp_parse_args( get_option( self::OPT, array() ), self::defaults() );
	}

	/* ---------- نصب ---------- */

	public static function activate() {
		self::create_table();
		add_option( self::OPT, self::defaults() );
	}

	const DB_VERSION = '4';

	/** ارتقای خودکار جدول (افزودن ستون وضعیت «دریافت‌شده») بدون نیاز به غیرفعال/فعال‌سازی */
	public static function maybe_upgrade() {
		if ( get_option( 'smsg_db_version' ) !== self::DB_VERSION ) {
			self::create_table();
		}
	}

	private static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta( "CREATE TABLE {$table} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			sender_id BIGINT(20) UNSIGNED NOT NULL,
			receiver_id BIGINT(20) UNSIGNED NOT NULL,
			message TEXT NOT NULL,
			is_read TINYINT(1) NOT NULL DEFAULT 0,
			is_delivered TINYINT(1) NOT NULL DEFAULT 0,
			msg_type VARCHAR(10) NOT NULL DEFAULT 'text',
			meta TEXT NULL,
			is_blocked TINYINT(1) NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY pair (sender_id, receiver_id),
			KEY inbox (receiver_id, is_read)
		) {$charset};" );
		update_option( 'smsg_db_version', self::DB_VERSION );
	}

	public static function init() {
		self::maybe_upgrade();
		add_shortcode( 'simple_messenger', array( __CLASS__, 'shortcode' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
		add_action( 'login_init', array( __CLASS__, 'maybe_redirect_login' ) );
		add_filter( 'login_url', array( __CLASS__, 'filter_login_url' ), 10, 3 );
		add_filter( 'register_url', array( __CLASS__, 'filter_register_url' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), array( __CLASS__, 'action_links' ) );
	}

	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=simple-messenger' ) ) . '">تنظیمات</a>' );
		return $links;
	}

	/* ---------- ورود / ثبت‌نام (پینوا) ---------- */

	public static function filter_login_url( $login_url, $redirect, $force_reauth ) {
		$s = self::settings();
		if ( empty( $s['login_url'] ) ) {
			return $login_url;
		}
		return $redirect ? add_query_arg( 'redirect_to', rawurlencode( $redirect ), $s['login_url'] ) : $s['login_url'];
	}

	public static function filter_register_url( $url ) {
		$s = self::settings();
		if ( ! empty( $s['register_url'] ) ) {
			return $s['register_url'];
		}
		return ! empty( $s['login_url'] ) ? $s['login_url'] : $url;
	}

	/** ورود اضطراری مدیر: wp-login.php?smsg_bypass=1 */
	public static function maybe_redirect_login() {
		$s = self::settings();
		if ( empty( $s['redirect_login'] ) || empty( $s['login_url'] ) ) {
			return;
		}
		if ( isset( $_GET['smsg_bypass'] ) || 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			return;
		}
		$action = isset( $_REQUEST['action'] ) ? sanitize_key( $_REQUEST['action'] ) : 'login';
		if ( ! in_array( $action, array( 'login', 'register' ), true ) ) {
			return;
		}
		$target = ( 'register' === $action && ! empty( $s['register_url'] ) ) ? $s['register_url'] : $s['login_url'];
		if ( ! empty( $_GET['redirect_to'] ) ) {
			$target = add_query_arg( 'redirect_to', rawurlencode( wp_unslash( $_GET['redirect_to'] ) ), $target );
		}
		wp_redirect( $target ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	/* ---------- شورت‌کد ---------- */

	/** مقدار CSS پس‌زمینهٔ چت */
	private static function wall_css( $s ) {
		if ( ! empty( $s['chat_bg_image'] ) ) {
			$url = str_replace( array( '"', '(', ')' ), array( '%22', '%28', '%29' ), esc_url_raw( $s['chat_bg_image'] ) );
			return 'url("' . $url . '") center / cover no-repeat';
		}
		if ( ! empty( $s['chat_bg_color'] ) && sanitize_hex_color( $s['chat_bg_color'] ) ) {
			return $s['chat_bg_color'];
		}
		return 'linear-gradient(135deg, #c9d99f 0%, #8fb08a 55%, #6f9d8a 100%)';
	}

	public static function shortcode( $atts = array() ) {
		$atts  = shortcode_atts( array( 'fullscreen' => '1' ), $atts, 'simple_messenger' );
		$fs    = ! in_array( strtolower( (string) $atts['fullscreen'] ), array( '0', 'false', 'no' ), true );
		$s     = self::settings();
		$cls   = 'smsg-root' . ( $fs ? ' smsg-fullscreen' : '' );
		$style = '--smsg-wall:' . self::wall_css( $s );

		wp_enqueue_style( 'smsg', SMSG_URL . 'assets/messenger.css', array(), SMSG_VERSION );

		if ( ! is_user_logged_in() ) {
			global $wp;
			$current = home_url( add_query_arg( array(), $wp->request ?? '' ) );
			$login   = wp_login_url( $current );
			$reg     = ! empty( $s['register_url'] ) ? $s['register_url'] : $login;
			ob_start(); ?>
			<div class="<?php echo esc_attr( $cls ); ?> smsg-gate-wrap" dir="rtl" style="<?php echo esc_attr( $style ); ?>">
				<div class="smsg-gate">
					<h3>برای استفاده از مسنجر وارد شوید</h3>
					<p>فقط اعضای سایت می‌توانند پیام بفرستند و دریافت کنند.</p>
					<p>
						<a class="smsg-btn" href="<?php echo esc_url( $login ); ?>">ورود</a>
						<a class="smsg-btn smsg-btn-ghost" href="<?php echo esc_url( $reg ); ?>">ثبت‌نام</a>
					</p>
				</div>
			</div>
			<?php
			return ob_get_clean();
		}

		$me = get_current_user_id();
		wp_enqueue_script( 'smsg', SMSG_URL . 'assets/messenger.js', array(), SMSG_VERSION, true );
		wp_localize_script( 'smsg', 'SMSG', array(
			'loggedIn'   => 1,
			'rest'       => esc_url_raw( rest_url( 'smsg/v1/' ) ),
			'nonce'      => wp_create_nonce( 'wp_rest' ),
			'me'         => $me,
			'meCard'     => self::user_card( $me, true ),
			'logoutUrl'  => wp_specialchars_decode( wp_logout_url( get_permalink() ?: home_url( '/' ) ) ),
			'fullscreen' => $fs ? 1 : 0,
			'poll'       => max( 2, (int) $s['poll_interval'] ) * 1000,
			'max'        => (int) $s['max_length'],
			'maxFile'    => max( 1, (int) $s['max_file_mb'] ),
			'maxVideo'   => max( 1, (int) $s['max_video_mb'] ),
			'maxMusic'   => max( 1, (int) $s['max_music_mb'] ),
			'hasMap'     => ! empty( $s['neshan_key'] ) ? 1 : 0,
			'mapLink'    => (string) $s['map_link'],
			'sounds'     => array(
				'in'  => SMSG_URL . 'assets/sounds/In_Chat.mp3',
				'out' => SMSG_URL . 'assets/sounds/Out_Chat.mp3',
			),
		) );

		return '<div id="smsg-app" class="' . esc_attr( $cls ) . '" dir="rtl" style="' . esc_attr( $style ) . '"></div>';
	}

	/* ---------- REST API ---------- */

	public static function routes() {
		$perm = static function () {
			return is_user_logged_in();
		};
		register_rest_route( 'smsg/v1', '/users', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_users' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/conversations', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_conversations' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/messages', array(
			array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'api_get_messages' ), 'permission_callback' => $perm ),
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_send' ), 'permission_callback' => $perm ),
		) );
		register_rest_route( 'smsg/v1', '/me', array(
			array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'api_me' ), 'permission_callback' => $perm ),
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_me_update' ), 'permission_callback' => $perm ),
		) );
		register_rest_route( 'smsg/v1', '/user', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_user' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/username-check', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_username_check' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/blocks', array(
			array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'api_blocks' ), 'permission_callback' => $perm ),
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_block_add' ), 'permission_callback' => $perm ),
			array( 'methods' => 'DELETE', 'callback' => array( __CLASS__, 'api_block_remove' ), 'permission_callback' => $perm ),
		) );
		register_rest_route( 'smsg/v1', '/location', array(
			'methods' => 'POST', 'callback' => array( __CLASS__, 'api_location' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/map', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_map' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/upload', array(
			'methods' => 'POST', 'callback' => array( __CLASS__, 'api_upload' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/file', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_file' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/status', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_status' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/activity', array(
			'methods' => 'POST', 'callback' => array( __CLASS__, 'api_activity' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/receipts', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_receipts' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/contacts', array(
			array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'api_contacts' ), 'permission_callback' => $perm ),
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_contact_add' ), 'permission_callback' => $perm ),
			array( 'methods' => 'DELETE', 'callback' => array( __CLASS__, 'api_contact_remove' ), 'permission_callback' => $perm ),
		) );
		register_rest_route( 'smsg/v1', '/me/avatar', array(
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_avatar_upload' ), 'permission_callback' => $perm ),
			array( 'methods' => 'DELETE', 'callback' => array( __CLASS__, 'api_avatar_remove' ), 'permission_callback' => $perm ),
		) );
	}

	private static function avatar_url( $user_id ) {
		$att = (int) get_user_meta( $user_id, 'smsg_avatar', true );
		return $att ? ( wp_get_attachment_url( $att ) ?: '' ) : '';
	}

	/** اطلاعات عمومی کاربر؛ نام کاربری وردپرس (شمارهٔ موبایل) هرگز بازگردانده نمی‌شود. */
	private static function user_card( $user_id, $private = false ) {
		$u = get_userdata( $user_id );
		if ( ! $u ) {
			return array( 'id' => (int) $user_id, 'name' => 'کاربر حذف‌شده', 'avatar' => '', 'username' => '', 'bio' => '' );
		}
		$card = array(
			'id'       => (int) $u->ID,
			'name'     => $u->display_name,
			'avatar'   => self::avatar_url( $u->ID ),
			'username' => (string) get_user_meta( $u->ID, 'smsg_username', true ),
			'bio'      => (string) get_user_meta( $u->ID, 'smsg_bio', true ),
		);
		if ( $private ) {
			$card['first_name']  = (string) get_user_meta( $u->ID, 'first_name', true );
			$card['hide_status'] = get_user_meta( $u->ID, 'smsg_hide_status', true ) ? 1 : 0;
		}
		return $card;
	}

	private static function fmt( $row, $with_thumb = true ) {
		$out = array(
			'id'   => (int) $row->id,
			'from' => (int) $row->sender_id,
			'to'   => (int) $row->receiver_id,
			'text' => $row->message,
			'ts'   => strtotime( $row->created_at . ' UTC' ),
			// وضعیت: ۰ ارسال‌شده، ۱ دریافت‌شده (کلاینت گیرنده آن را گرفته)، ۲ دیده‌شده
			'st'   => ! empty( $row->is_read ) ? 2 : ( ! empty( $row->is_delivered ) ? 1 : 0 ),
			'type' => 'text',
		);
		if ( ! empty( $row->msg_type ) && 'text' !== $row->msg_type ) {
			$meta = json_decode( (string) $row->meta, true );
			if ( is_array( $meta ) ) {
				$out['type'] = in_array( $row->msg_type, array( 'voice', 'image', 'video', 'music' ), true ) ? $row->msg_type : 'file';
				$out['file'] = array(
					'name' => (string) ( $meta['name'] ?? '' ),
					'size' => (int) ( $meta['size'] ?? 0 ),
					'mime' => (string) ( $meta['mime'] ?? '' ),
					'dur'  => (int) ( $meta['dur'] ?? 0 ),
					'w'    => (int) ( $meta['w'] ?? 0 ),
					'h'    => (int) ( $meta['h'] ?? 0 ),
					'title'  => (string) ( $meta['title'] ?? '' ),
					'artist' => (string) ( $meta['artist'] ?? '' ),
				);
				if ( $with_thumb && ! empty( $meta['thumb'] ) ) {
					$out['thumb'] = 'data:image/jpeg;base64,' . $meta['thumb']; // پیش‌نمایش بسیار کوچک برای حالت تار
				}
				if ( 'location' === $row->msg_type ) {
					unset( $out['file'] );
					$out['type'] = 'location';
					$out['loc']  = array(
						'lat' => (float) ( $meta['lat'] ?? 0 ),
						'lng' => (float) ( $meta['lng'] ?? 0 ),
						'acc' => (int) ( $meta['acc'] ?? 0 ),
					);
				}
			}
		}
		return $out;
	}

	private static function err( $code, $msg, $status = 400 ) {
		return new WP_Error( 'smsg_' . $code, $msg, array( 'status' => $status ) );
	}

	/* --- پروفایل --- */

	public static function api_me() {
		return self::user_card( get_current_user_id(), true );
	}

	public static function api_me_update( WP_REST_Request $req ) {
		$me      = get_current_user_id();
		$changes = array();

		if ( $req->has_param( 'display_name' ) ) {
			$v = trim( sanitize_text_field( (string) $req->get_param( 'display_name' ) ) );
			if ( mb_strlen( $v ) < 2 || mb_strlen( $v ) > 40 ) {
				return self::err( 'name', 'نام نمایشی باید بین ۲ تا ۴۰ نویسه باشد.' );
			}
			$changes['display_name'] = $v;
		}
		if ( $req->has_param( 'first_name' ) ) {
			$v = trim( sanitize_text_field( (string) $req->get_param( 'first_name' ) ) );
			if ( mb_strlen( $v ) > 40 ) {
				return self::err( 'first', 'نام نباید بیشتر از ۴۰ نویسه باشد.' );
			}
			$changes['first_name'] = $v;
		}
		if ( $req->has_param( 'bio' ) ) {
			$v = trim( sanitize_text_field( (string) $req->get_param( 'bio' ) ) );
			if ( mb_strlen( $v ) > 140 ) {
				return self::err( 'bio', 'بیوگرافی نباید بیشتر از ۱۴۰ نویسه باشد.' );
			}
			$changes['bio'] = $v;
		}
		if ( $req->has_param( 'username' ) ) {
			$v = strtolower( ltrim( trim( (string) $req->get_param( 'username' ) ), '@' ) );
			if ( '' !== $v ) {
				$ok = self::check_username( $v, $me );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
			}
			$changes['username'] = $v;
		}

		if ( $req->has_param( 'hide_status' ) ) {
			$changes['hide_status'] = $req->get_param( 'hide_status' ) ? 1 : 0;
		}

		if ( isset( $changes['display_name'] ) ) {
			$res = wp_update_user( array( 'ID' => $me, 'display_name' => $changes['display_name'] ) );
			if ( is_wp_error( $res ) ) {
				return self::err( 'name', 'ذخیرهٔ نام انجام نشد.', 500 );
			}
		}
		if ( isset( $changes['first_name'] ) ) {
			update_user_meta( $me, 'first_name', $changes['first_name'] );
		}
		if ( isset( $changes['bio'] ) ) {
			update_user_meta( $me, 'smsg_bio', $changes['bio'] );
		}
		if ( isset( $changes['username'] ) ) {
			if ( '' === $changes['username'] ) {
				delete_user_meta( $me, 'smsg_username' );
			} else {
				update_user_meta( $me, 'smsg_username', $changes['username'] );
			}
		}
		if ( isset( $changes['hide_status'] ) ) {
			if ( $changes['hide_status'] ) {
				update_user_meta( $me, 'smsg_hide_status', 1 );
			} else {
				delete_user_meta( $me, 'smsg_hide_status' );
			}
		}
		clean_user_cache( $me );
		return self::user_card( $me, true );
	}

	/** اعتبارسنجی و بررسی تکراری‌نبودن نام کاربری */
	private static function check_username( $v, $me ) {
		if ( ! preg_match( '/^[a-z][a-z0-9_]{4,31}$/', $v ) ) {
			return self::err( 'username', 'نام کاربری باید ۵ تا ۳۲ نویسه باشد، با حرف انگلیسی شروع شود و فقط شامل حروف انگلیسی، عدد و _ باشد.' );
		}
		if ( in_array( $v, array( 'admin', 'administrator', 'support', 'root', 'system' ), true ) ) {
			return self::err( 'username', 'این نام کاربری مجاز نیست.' );
		}
		$taken = get_users( array(
			'meta_key'   => 'smsg_username',
			'meta_value' => $v,
			'exclude'    => array( $me ),
			'number'     => 1,
			'fields'     => 'ID',
		) );
		if ( $taken ) {
			return self::err( 'username_taken', 'این نام کاربری قبلاً گرفته شده است.', 409 );
		}
		return true;
	}

	public static function api_username_check( WP_REST_Request $req ) {
		$me    = get_current_user_id();
		$key   = 'smsg_uc_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 60 ) {
			return self::err( 'rate', 'تعداد بررسی‌ها زیاد است. کمی صبر کنید.', 429 );
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );

		$v = strtolower( ltrim( trim( (string) $req->get_param( 'username' ) ), '@' ) );
		if ( '' === $v ) {
			return array( 'available' => true, 'message' => '' );
		}
		if ( get_user_meta( $me, 'smsg_username', true ) === $v ) {
			return array( 'available' => true, 'message' => 'این نام کاربری فعلی شماست.' );
		}
		$r = self::check_username( $v, $me );
		if ( is_wp_error( $r ) ) {
			return array( 'available' => false, 'message' => $r->get_error_message() );
		}
		return array( 'available' => true, 'message' => 'این نام کاربری آزاد است و می‌توانید آن را انتخاب کنید.' );
	}

	public static function api_user( WP_REST_Request $req ) {
		$id = (int) $req->get_param( 'id' );
		if ( ! $id || ! get_userdata( $id ) ) {
			return self::err( 'user', 'کاربر پیدا نشد.', 404 );
		}
		return self::user_card( $id );
	}

	public static function api_avatar_upload( WP_REST_Request $req ) {
		$me    = get_current_user_id();
		$files = $req->get_file_params();
		$f     = $files['avatar'] ?? null;

		if ( ! $f || ! empty( $f['error'] ) || empty( $f['tmp_name'] ) ) {
			return self::err( 'upload', 'فایلی دریافت نشد.' );
		}
		if ( $f['size'] > 3 * MB_IN_BYTES ) {
			return self::err( 'upload', 'حجم تصویر نباید بیشتر از ۳ مگابایت باشد.' );
		}
		$ext_map = array( 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp' );
		$mime    = wp_get_image_mime( $f['tmp_name'] );
		if ( ! $mime || ! isset( $ext_map[ $mime ] ) ) {
			return self::err( 'upload', 'فقط تصویر JPG، PNG، GIF یا WebP مجاز است.' );
		}

		// محدودیت: ۵ بار تغییر عکس در ساعت
		$key   = 'smsg_avup_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 5 ) {
			return self::err( 'rate', 'تعداد تغییر عکس زیاد است. کمی بعد دوباره تلاش کنید.', 429 );
		}
		set_transient( $key, $count + 1, HOUR_IN_SECONDS );

		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		add_filter( 'intermediate_image_sizes_advanced', '__return_empty_array' );
		$id = media_handle_sideload(
			array( 'name' => 'avatar-' . $me . '-' . time() . '.' . $ext_map[ $mime ], 'tmp_name' => $f['tmp_name'] ),
			0,
			null,
			array( 'post_title' => 'Messenger avatar #' . $me )
		);
		if ( is_wp_error( $id ) ) {
			remove_filter( 'intermediate_image_sizes_advanced', '__return_empty_array' );
			return self::err( 'upload', 'بارگذاری تصویر انجام نشد.', 500 );
		}

		// تصویر از سمت کاربر برش خورده؛ اینجا فقط به حداکثر ۵۱۲×۵۱۲ محدود می‌شود
		$path   = get_attached_file( $id );
		$editor = wp_get_image_editor( $path );
		if ( ! is_wp_error( $editor ) ) {
			$editor->resize( 512, 512, true );
			$editor->save( $path );
			wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $path ) );
		}
		remove_filter( 'intermediate_image_sizes_advanced', '__return_empty_array' );
		update_post_meta( $id, '_smsg_avatar', $me );

		self::delete_avatar( $me );
		update_user_meta( $me, 'smsg_avatar', $id );
		return self::user_card( $me, true );
	}

	public static function api_avatar_remove() {
		$me = get_current_user_id();
		self::delete_avatar( $me );
		delete_user_meta( $me, 'smsg_avatar' );
		return self::user_card( $me, true );
	}

	private static function delete_avatar( $user_id ) {
		$old = (int) get_user_meta( $user_id, 'smsg_avatar', true );
		if ( $old && (int) get_post_meta( $old, '_smsg_avatar', true ) === (int) $user_id ) {
			wp_delete_attachment( $old, true );
		}
	}

	/* --- ارسال فایل و ویس --- */

	const BLOCKED_EXT = array( 'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'pht', 'phps', 'cgi', 'pl', 'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'sh', 'vbs', 'jar', 'dll' );
	const VOICE_MIMES = array( 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac', 'audio/wav' );
	const MAX_VOICE_SEC = 600;

	/** پوشهٔ خصوصی فایل‌ها: دسترسی مستقیم مسدود است و فقط از مسیر REST (با بررسی فرستنده/گیرنده) ارائه می‌شود. */
	private static function private_dir() {
		$u   = wp_upload_dir();
		$dir = trailingslashit( $u['basedir'] ) . 'smsg-private';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		if ( ! file_exists( $dir . '/.htaccess' ) ) {
			@file_put_contents( $dir . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n" ); // phpcs:ignore
		}
		if ( ! file_exists( $dir . '/index.php' ) ) {
			@file_put_contents( $dir . '/index.php', "<?php\n// Silence is golden.\n" ); // phpcs:ignore
		}
		return $dir;
	}

	/* --- بلاک کردن کاربران --- */

	const MAX_BLOCKS = 500;

	private static function blocked_ids( $user_id ) {
		$ids = get_user_meta( $user_id, 'smsg_blocked', true );
		return is_array( $ids ) ? array_values( array_unique( array_map( 'intval', $ids ) ) ) : array();
	}

	/** آیا $by کاربر $user را بلاک کرده است؟ */
	private static function is_blocked_by( $by, $user ) {
		return in_array( (int) $user, self::blocked_ids( (int) $by ), true );
	}

	/** خطای ارسال پیام، اگر بین دو کاربر بلاک برقرار باشد (در غیر این صورت null) */
	private static function block_error( $me, $to ) {
		if ( self::is_blocked_by( $me, $to ) ) {
			return self::err( 'blocked_by_me', 'این کاربر را بلاک کرده‌اید. برای ارسال پیام ابتدا او را از لیست بلاکی‌ها خارج کنید.', 403 );
		}
		if ( self::is_blocked_by( $to, $me ) && 'silent' !== self::settings()['block_mode'] ) {
			return self::err( 'blocked', 'امکان ارسال پیام به این کاربر وجود ندارد.', 403 );
		}
		return null;
	}

	/** در حالت «بی‌صدا»، اگر گیرنده فرستنده را بلاک کرده باشد، پیام ثبت می‌شود اما برای گیرنده پنهان می‌ماند. */
	private static function silent_flag( $me, $to ) {
		return ( 'silent' === self::settings()['block_mode'] && self::is_blocked_by( $to, $me ) ) ? 1 : 0;
	}

	private static function blocks_response( $user_id ) {
		$cards = array();
		foreach ( self::blocked_ids( $user_id ) as $id ) {
			if ( get_userdata( $id ) ) {
				$cards[] = self::user_card( $id );
			}
		}
		usort( $cards, static function ( $a, $b ) {
			return strcmp( mb_strtolower( $a['name'] ), mb_strtolower( $b['name'] ) );
		} );
		return $cards;
	}

	public static function api_blocks() {
		return self::blocks_response( get_current_user_id() );
	}

	public static function api_block_add( WP_REST_Request $req ) {
		$me = get_current_user_id();
		$id = (int) $req->get_param( 'id' );
		if ( ! $id || $id === $me || ! get_userdata( $id ) ) {
			return self::err( 'block', 'کاربر نامعتبر است.' );
		}
		$ids = self::blocked_ids( $me );
		if ( ! in_array( $id, $ids, true ) ) {
			if ( count( $ids ) >= self::MAX_BLOCKS ) {
				return self::err( 'block_max', 'به سقف تعداد بلاکی‌ها رسیده‌اید.' );
			}
			$ids[] = $id;
			update_user_meta( $me, 'smsg_blocked', $ids );
		}
		return self::blocks_response( $me );
	}

	public static function api_block_remove( WP_REST_Request $req ) {
		$me  = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$ids = array_values( array_diff( self::blocked_ids( $me ), array( $id ) ) );
		update_user_meta( $me, 'smsg_blocked', $ids );
		return self::blocks_response( $me );
	}

	private static function clean_map_link( $v ) {
		$v = trim( sanitize_text_field( (string) $v ) );
		return preg_match( '#^(https?://|geo:)#i', $v ) ? $v : 'geo:{lat},{lng}';
	}

	/** ارسال موقعیت مکانی (مختصات از GPS مرورگر؛ هیچ سرویس بیرونی لازم نیست) */
	public static function api_location( WP_REST_Request $req ) {
		global $wpdb;
		$me  = get_current_user_id();
		$to  = (int) $req->get_param( 'to' );
		$lat = (float) $req->get_param( 'lat' );
		$lng = (float) $req->get_param( 'lng' );
		if ( ! $to || $to === $me || ! get_userdata( $to ) ) {
			return self::err( 'user', 'گیرنده نامعتبر است.' );
		}
		$bl = self::block_error( $me, $to );
		if ( $bl ) {
			return $bl;
		}
		if ( ! is_finite( $lat ) || ! is_finite( $lng ) || abs( $lat ) > 90 || abs( $lng ) > 180 ) {
			return self::err( 'location', 'مختصات نامعتبر است.' );
		}
		$caption = trim( sanitize_textarea_field( (string) $req->get_param( 'caption' ) ) );
		if ( mb_strlen( $caption ) > (int) self::settings()['max_length'] ) {
			return self::err( 'long', 'توضیح بیش از حد طولانی است.' );
		}
		$key   = 'smsg_up_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 10 ) {
			return self::err( 'rate', 'تعداد ارسال‌ها زیاد است. کمی صبر کنید.', 429 );
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );

		$meta = array(
			'lat' => round( $lat, 6 ),
			'lng' => round( $lng, 6 ),
			'acc' => min( 100000, max( 0, (int) $req->get_param( 'acc' ) ) ),
		);
		$ok = $wpdb->insert( self::table(), array(
			'sender_id'   => $me,
			'receiver_id' => $to,
			'message'     => $caption,
			'is_read'     => 0,
			'msg_type'    => 'location',
			'is_blocked'  => self::silent_flag( $me, $to ),
			'meta'        => wp_json_encode( $meta ),
			'created_at'  => gmdate( 'Y-m-d H:i:s' ),
		), array( '%d', '%d', '%s', '%d', '%s', '%d', '%s', '%s' ) );
		if ( ! $ok ) {
			return self::err( 'location', 'ثبت پیام انجام نشد.', 500 );
		}
		delete_transient( 'smsg_act_' . $me . '_' . $to );
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $wpdb->insert_id ) );
		return self::fmt( $row );
	}

	/** تصویر نقشهٔ استاتیک (نشان) برای یک پیام موقعیت؛ روی سرور کش می‌شود. بدون کلید، ۴۰۴ برمی‌گرداند. */
	public static function api_map( WP_REST_Request $req ) {
		global $wpdb;
		$me  = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$s   = self::settings();
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $id ) );
		if ( empty( $s['neshan_key'] ) || ! $row || 'location' !== $row->msg_type
			|| ( (int) $row->sender_id !== $me && (int) $row->receiver_id !== $me )
			|| ( (int) $row->sender_id !== $me && ! empty( $row->is_blocked ) ) ) {
			return self::err( 'map', 'نقشه در دسترس نیست.', 404 );
		}
		$path = self::private_dir() . '/map-' . $id . '.png';
		if ( ! is_file( $path ) ) {
			if ( get_transient( 'smsg_mapfail_' . $id ) ) {
				return self::err( 'map', 'نقشه در دسترس نیست.', 404 );
			}
			$meta = json_decode( (string) $row->meta, true );
			$url  = add_query_arg( array(
				'key'       => $s['neshan_key'],
				'type'      => 'light',
				'width'     => 500,
				'height'    => 300,
				'zoom'      => 16,
				'latitude'  => (float) ( $meta['lat'] ?? 0 ),
				'longitude' => (float) ( $meta['lng'] ?? 0 ),
				'marker'    => 'red',
			), 'https://api.neshan.org/v5/static' );
			$res  = wp_remote_get( $url, array( 'timeout' => 8 ) );
			$body = is_wp_error( $res ) ? '' : wp_remote_retrieve_body( $res );
			$type = is_wp_error( $res ) ? '' : (string) wp_remote_retrieve_header( $res, 'content-type' );
			if ( is_wp_error( $res ) || 200 !== (int) wp_remote_retrieve_response_code( $res ) || 0 !== strpos( $type, 'image/' ) || strlen( $body ) < 100 ) {
				set_transient( 'smsg_mapfail_' . $id, 1, 5 * MINUTE_IN_SECONDS );
				return self::err( 'map', 'نقشه در دسترس نیست.', 404 );
			}
			@file_put_contents( $path, $body ); // phpcs:ignore
		}
		$info = @getimagesize( $path ); // phpcs:ignore
		if ( ! $info || ! in_array( $info['mime'], array( 'image/png', 'image/jpeg' ), true ) ) {
			@unlink( $path ); // phpcs:ignore
			return self::err( 'map', 'نقشه در دسترس نیست.', 404 );
		}
		while ( ob_get_level() ) {
			ob_end_clean();
		}
		status_header( 200 );
		header( 'Content-Type: ' . $info['mime'] );
		header( 'Content-Length: ' . filesize( $path ) );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Cache-Control: private, max-age=86400' );
		readfile( $path ); // phpcs:ignore
		exit;
	}

	/** پیش‌نمایش تار: فقط JPEG کوچک (حداکثر ۸۰ پیکسل) به‌صورت base64 پذیرفته می‌شود. */
	private static function clean_thumb( $data ) {
		if ( strlen( $data ) > 12000 || ! preg_match( '#^data:image/jpeg;base64,([A-Za-z0-9+/=]+)$#', $data, $m ) ) {
			return '';
		}
		$bin  = base64_decode( $m[1], true );
		$info = $bin ? @getimagesizefromstring( $bin ) : false; // phpcs:ignore
		if ( ! $info || 'image/jpeg' !== $info['mime'] || $info[0] > 80 || $info[1] > 80 ) {
			return '';
		}
		return $m[1];
	}

	public static function api_upload( WP_REST_Request $req ) {
		global $wpdb;
		$me   = get_current_user_id();
		$to   = (int) $req->get_param( 'to' );
		$kind_in = (string) $req->get_param( 'kind' );
		$kind    = in_array( $kind_in, array( 'voice', 'image', 'video', 'music' ), true ) ? $kind_in : 'file';
		$s    = self::settings();

		if ( ! $to || $to === $me || ! get_userdata( $to ) ) {
			return self::err( 'user', 'گیرنده نامعتبر است.' );
		}
		$bl = self::block_error( $me, $to );
		if ( $bl ) {
			return $bl;
		}
		$caption = 'voice' !== $kind ? trim( sanitize_textarea_field( (string) $req->get_param( 'caption' ) ) ) : '';
		if ( mb_strlen( $caption ) > (int) $s['max_length'] ) {
			return self::err( 'long', 'توضیح فایل بیش از حد طولانی است.' );
		}

		$files = $req->get_file_params();
		$f     = $files['file'] ?? null;
		if ( $f && in_array( (int) ( $f['error'] ?? 0 ), array( UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE ), true ) ) {
			return self::err( 'upload', 'حجم فایل بیشتر از حد مجاز سرور است.', 413 );
		}
		if ( ! $f || ! empty( $f['error'] ) || empty( $f['tmp_name'] ) || ! is_uploaded_file( $f['tmp_name'] ) ) {
			return self::err( 'upload', 'فایلی دریافت نشد.' );
		}
		$max_mb = max( 1, (int) ( 'video' === $kind ? $s['max_video_mb'] : ( 'music' === $kind ? $s['max_music_mb'] : $s['max_file_mb'] ) ) );
		$size   = (int) $f['size'];
		if ( $size <= 0 ) {
			return self::err( 'upload', 'فایل خالی است.' );
		}
		if ( $size > $max_mb * MB_IN_BYTES ) {
			return self::err( 'upload', "حجم فایل نباید بیشتر از {$max_mb} مگابایت باشد.", 413 );
		}

		$key   = 'smsg_up_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 10 ) {
			return self::err( 'rate', 'تعداد ارسال فایل زیاد است. کمی صبر کنید.', 429 );
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );

		$detected = '';
		if ( function_exists( 'finfo_open' ) ) {
			$fi = finfo_open( FILEINFO_MIME_TYPE );
			if ( $fi ) {
				$detected = (string) finfo_file( $fi, $f['tmp_name'] );
				finfo_close( $fi );
			}
		}

		$dur   = 0;
		$w     = 0;
		$h     = 0;
		$thumb  = '';
		$title  = '';
		$artist = '';
		if ( 'voice' === $kind ) {
			$parts    = explode( ';', strtolower( (string) $req->get_param( 'mime' ) ) );
			$declared = trim( $parts[0] );
			if ( ! in_array( $declared, self::VOICE_MIMES, true ) ) {
				return self::err( 'upload', 'قالب پیام صوتی پشتیبانی نمی‌شود.' );
			}
			$okdet = array( 'video/webm', 'video/mp4', 'video/ogg', 'application/ogg' );
			if ( '' !== $detected && 0 !== strpos( $detected, 'audio/' ) && ! in_array( $detected, $okdet, true ) ) {
				return self::err( 'upload', 'فایل ارسالی یک پیام صوتی معتبر نیست.' );
			}
			$mime = 'audio/x-m4a' === $declared ? 'audio/mp4' : $declared;
			$name = 'voice';
			$dur  = min( self::MAX_VOICE_SEC, max( 0, (int) $req->get_param( 'duration' ) ) );
		} elseif ( 'music' === $kind ) {
			$name = sanitize_file_name( wp_basename( (string) $f['name'] ) );
			if ( '' === $name ) {
				$name = 'music';
			}
			$name = mb_substr( $name, -120 );
			$ext  = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
			$map  = array(
				'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg',
				'opus' => 'audio/ogg', 'wav' => 'audio/wav', 'flac' => 'audio/flac', 'weba' => 'audio/webm',
			);
			if ( ! isset( $map[ $ext ] ) ) {
				return self::err( 'upload', 'فقط فایل موزیک (MP3، M4A، AAC، OGG، WAV، FLAC) مجاز است.' );
			}
			$okdet = array( 'video/mp4', 'video/webm', 'video/ogg', 'application/ogg', 'application/octet-stream' );
			if ( '' !== $detected && 0 !== strpos( $detected, 'audio/' ) && ! in_array( $detected, $okdet, true ) ) {
				return self::err( 'upload', 'فایل ارسالی یک موزیک معتبر نیست.' );
			}
			$mime   = $map[ $ext ];
			$dur    = min( 36000, max( 0, (int) $req->get_param( 'duration' ) ) );
			$thumb  = self::clean_thumb( (string) $req->get_param( 'thumb' ) ); // جلد آلبوم (کوچک)
			$title  = mb_substr( sanitize_text_field( (string) $req->get_param( 'title' ) ), 0, 100 );
			$artist = mb_substr( sanitize_text_field( (string) $req->get_param( 'artist' ) ), 0, 100 );
		} elseif ( 'image' === $kind || 'video' === $kind ) {
			$name = sanitize_file_name( wp_basename( (string) $f['name'] ) );
			if ( '' === $name ) {
				$name = $kind;
			}
			$name = mb_substr( $name, -120 );
			$mime = $detected;
			if ( 'image' === $kind ) {
				$info = @getimagesize( $f['tmp_name'] ); // phpcs:ignore
				if ( ! $info || ! in_array( $info['mime'], array( 'image/jpeg', 'image/png', 'image/gif', 'image/webp' ), true ) ) {
					return self::err( 'upload', 'فقط تصویر JPG، PNG، GIF یا WebP مجاز است.' );
				}
				$mime = $info['mime'];
				$w    = (int) $info[0];
				$h    = (int) $info[1];
			} else {
				if ( 'video/x-m4v' === $mime ) {
					$mime = 'video/mp4';
				}
				if ( '' === $mime ) {
					$parts = explode( ';', strtolower( (string) ( $f['type'] ?? '' ) ) );
					$mime  = trim( $parts[0] );
				}
				if ( ! in_array( $mime, array( 'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/3gpp' ), true ) ) {
					return self::err( 'upload', 'قالب ویدئو پشتیبانی نمی‌شود (MP4، WebM یا MOV).' );
				}
				$w = min( 10000, max( 0, (int) $req->get_param( 'w' ) ) );
				$h = min( 10000, max( 0, (int) $req->get_param( 'h' ) ) );
			}
			$dur   = min( 36000, max( 0, (int) $req->get_param( 'duration' ) ) );
			$thumb = self::clean_thumb( (string) $req->get_param( 'thumb' ) );
		} else {
			$name = sanitize_file_name( wp_basename( (string) $f['name'] ) );
			if ( '' === $name ) {
				$name = 'file';
			}
			$name = mb_substr( $name, -120 );
			$ext  = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
			if ( in_array( $ext, self::BLOCKED_EXT, true ) ) {
				return self::err( 'upload', 'ارسال این نوع فایل مجاز نیست.' );
			}
			$mime = $detected;
			if ( '' === $mime ) {
				$ft   = wp_check_filetype( $name );
				$mime = $ft['type'] ? $ft['type'] : 'application/octet-stream';
			}
		}

		$dir    = self::private_dir();
		$stored = wp_generate_password( 32, false, false ) . '.bin'; // بدون پسوند اصلی؛ هرگز اجرا نمی‌شود
		if ( ! @move_uploaded_file( $f['tmp_name'], $dir . '/' . $stored ) ) { // phpcs:ignore
			return self::err( 'upload', 'ذخیرهٔ فایل انجام نشد.', 500 );
		}
		@chmod( $dir . '/' . $stored, 0644 ); // phpcs:ignore

		$ok = $wpdb->insert( self::table(), array(
			'sender_id'   => $me,
			'receiver_id' => $to,
			'message'     => $caption,
			'is_read'     => 0,
			'msg_type'    => $kind,
			'is_blocked'  => self::silent_flag( $me, $to ),
			'meta'        => wp_json_encode( array( 'file' => $stored, 'name' => $name, 'size' => $size, 'mime' => $mime, 'dur' => $dur, 'w' => $w, 'h' => $h, 'thumb' => $thumb, 'title' => $title, 'artist' => $artist ) ),
			'created_at'  => gmdate( 'Y-m-d H:i:s' ),
		), array( '%d', '%d', '%s', '%d', '%s', '%d', '%s', '%s' ) );
		if ( ! $ok ) {
			@unlink( $dir . '/' . $stored ); // phpcs:ignore
			return self::err( 'upload', 'ثبت پیام انجام نشد.', 500 );
		}

		delete_transient( 'smsg_act_' . $me . '_' . $to );
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $wpdb->insert_id ) );
		return self::fmt( $row );
	}

	/** ارائهٔ فایل/ویس فقط به فرستنده و گیرندهٔ همان پیام (با پشتیبانی از Range برای پخش صدا) */
	public static function api_file( WP_REST_Request $req ) {
		global $wpdb;
		$me  = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $id ) );
		if ( ! $row || empty( $row->msg_type ) || 'text' === $row->msg_type
			|| ( (int) $row->sender_id !== $me && (int) $row->receiver_id !== $me )
			|| ( (int) $row->sender_id !== $me && ! empty( $row->is_blocked ) ) ) {
			return self::err( 'file', 'فایل پیدا نشد.', 404 );
		}
		$meta = json_decode( (string) $row->meta, true );
		$path = self::private_dir() . '/' . basename( (string) ( $meta['file'] ?? '' ) );
		if ( ! is_array( $meta ) || ! is_file( $path ) ) {
			return self::err( 'file', 'فایل پیدا نشد.', 404 );
		}

		$size   = (int) filesize( $path );
		$inline = in_array( $row->msg_type, array( 'voice', 'image', 'video', 'music' ), true ) && ! $req->get_param( 'dl' );
		$mime   = (string) ( $meta['mime'] ?? 'application/octet-stream' );
		$name   = (string) ( $meta['name'] ?? 'file' );
		$start  = 0;
		$end    = $size - 1;
		$status = 200;
		if ( ! empty( $_SERVER['HTTP_RANGE'] ) && preg_match( '/^bytes=(\d*)-(\d*)$/', trim( $_SERVER['HTTP_RANGE'] ), $m ) ) { // phpcs:ignore
			if ( '' === $m[1] && '' !== $m[2] ) {
				$start = max( 0, $size - (int) $m[2] );
			} else {
				if ( '' !== $m[1] ) {
					$start = (int) $m[1];
				}
				if ( '' !== $m[2] ) {
					$end = min( $end, (int) $m[2] );
				}
			}
			if ( $start > $end || $start >= $size ) {
				status_header( 416 );
				header( 'Content-Range: bytes */' . $size );
				exit;
			}
			$status = 206;
		}

		while ( ob_get_level() ) {
			ob_end_clean();
		}
		status_header( $status );
		header( 'Content-Type: ' . $mime );
		header( 'Accept-Ranges: bytes' );
		header( 'Content-Length: ' . ( $end - $start + 1 ) );
		if ( 206 === $status ) {
			header( "Content-Range: bytes {$start}-{$end}/{$size}" );
		}
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Cache-Control: private, max-age=3600' );
		header( 'Content-Disposition: ' . ( $inline ? 'inline' : 'attachment' ) . '; filename="file"; filename*=UTF-8\'\'' . rawurlencode( $name ) );

		$fh = fopen( $path, 'rb' );
		if ( $fh ) {
			fseek( $fh, $start );
			$left = $end - $start + 1;
			while ( $left > 0 && ! feof( $fh ) ) {
				$chunk = fread( $fh, min( 8192, $left ) );
				if ( false === $chunk ) {
					break;
				}
				echo $chunk; // phpcs:ignore
				$left -= strlen( $chunk );
			}
			fclose( $fh );
		}
		exit;
	}

	/* --- وضعیت آنلاین / آخرین بازدید / فعالیت --- */

	const ACTIVITIES = array( 'typing', 'recording_voice', 'sending_image', 'sending_file', 'sending_video', 'sending_location', 'sending_music' );

	/** ثبت آخرین بازدید (حداکثر هر ۱۰ ثانیه یک‌بار نوشته می‌شود) */
	private static function touch( $user_id ) {
		$now = time();
		if ( $now - (int) get_user_meta( $user_id, 'smsg_last_seen', true ) >= 10 ) {
			update_user_meta( $user_id, 'smsg_last_seen', $now );
		}
	}

	/** وضعیت حضور کاربر؛ اگر کاربر آن را مخفی کرده باشد چیزی فاش نمی‌شود. */
	private static function presence( $user_id ) {
		if ( get_user_meta( $user_id, 'smsg_hide_status', true ) ) {
			return array( 'hidden' => true, 'online' => false, 'last_seen' => 0 );
		}
		$seen   = (int) get_user_meta( $user_id, 'smsg_last_seen', true );
		$window = max( 40, 2 * max( 2, (int) self::settings()['poll_interval'] ) + 10 );
		return array(
			'hidden'    => false,
			'online'    => $seen && ( time() - $seen ) <= $window,
			'last_seen' => $seen,
		);
	}

	public static function api_status( WP_REST_Request $req ) {
		$me = get_current_user_id();
		$id = (int) $req->get_param( 'id' );
		if ( ! $id || ! get_userdata( $id ) ) {
			return self::err( 'user', 'کاربر پیدا نشد.', 404 );
		}
		if ( '0' !== (string) $req->get_param( 'vis' ) ) {
			self::touch( $me );
		}
		$p   = self::presence( $id );
		$hid = self::is_blocked_by( $id, $me ); // اگر او مرا بلاک کرده، وضعیتش را نمی‌بینم
		if ( $hid ) {
			$p = array( 'hidden' => true, 'online' => false, 'last_seen' => 0 );
		}
		$act = get_transient( 'smsg_act_' . $id . '_' . $me );
		$p['activity'] = ( ! $hid && is_array( $act ) && time() - (int) $act['ts'] <= 7 ) ? $act['kind'] : '';
		return $p;
	}

	/** اعلام فعالیت جاری (تایپ، ضبط صدا، ارسال تصویر/فایل/ویدئو/لوکیشن/موزیک) یا kind=stop */
	public static function api_activity( WP_REST_Request $req ) {
		$me   = get_current_user_id();
		$to   = (int) $req->get_param( 'to' );
		$kind = sanitize_key( (string) $req->get_param( 'kind' ) );
		if ( ! $to || $to === $me || ! get_userdata( $to ) ) {
			return self::err( 'user', 'گیرنده نامعتبر است.' );
		}
		if ( self::is_blocked_by( $to, $me ) || self::is_blocked_by( $me, $to ) ) {
			return array( 'ok' => true ); // بدون اعلام فعالیت
		}
		$key = 'smsg_act_' . $me . '_' . $to;
		if ( 'stop' === $kind ) {
			delete_transient( $key );
			return array( 'ok' => true );
		}
		if ( ! in_array( $kind, self::ACTIVITIES, true ) ) {
			return self::err( 'activity', 'نوع فعالیت نامعتبر است.' );
		}
		$cur = get_transient( $key );
		if ( ! ( is_array( $cur ) && $cur['kind'] === $kind && time() - (int) $cur['ts'] < 2 ) ) {
			set_transient( $key, array( 'kind' => $kind, 'ts' => time() ), 10 );
		}
		return array( 'ok' => true );
	}

	/** وضعیت تحویل/مشاهدهٔ پیام‌های ارسالی من به یک کاربر (برای تیک‌ها) */
	public static function api_receipts( WP_REST_Request $req ) {
		global $wpdb;
		$me    = get_current_user_id();
		$peer  = (int) $req->get_param( 'with' );
		$since = (int) $req->get_param( 'since' );
		if ( ! $peer ) {
			return array();
		}
		$rows = $wpdb->get_results( $wpdb->prepare(
			'SELECT id, is_delivered, is_read FROM ' . self::table() . ' WHERE sender_id=%d AND receiver_id=%d AND id>=%d ORDER BY id ASC LIMIT 200',
			$me, $peer, $since
		) );
		return array_map( static function ( $r ) {
			return array( 'id' => (int) $r->id, 'st' => $r->is_read ? 2 : ( $r->is_delivered ? 1 : 0 ) );
		}, $rows );
	}

	/* --- مخاطبین --- */

	const MAX_CONTACTS = 500;

	private static function contact_ids( $user_id ) {
		$ids = get_user_meta( $user_id, 'smsg_contacts', true );
		return is_array( $ids ) ? array_values( array_unique( array_map( 'intval', $ids ) ) ) : array();
	}

	/** فهرست کارت مخاطبین (مرتب بر اساس نام)؛ کاربران حذف‌شده نادیده گرفته می‌شوند. */
	private static function contacts_response( $user_id ) {
		$cards = array();
		foreach ( self::contact_ids( $user_id ) as $id ) {
			if ( get_userdata( $id ) ) {
				$cards[] = self::user_card( $id );
			}
		}
		usort( $cards, static function ( $a, $b ) {
			return strcmp( mb_strtolower( $a['name'] ), mb_strtolower( $b['name'] ) );
		} );
		return $cards;
	}

	public static function api_contacts() {
		return self::contacts_response( get_current_user_id() );
	}

	public static function api_contact_add( WP_REST_Request $req ) {
		$me = get_current_user_id();
		$id = (int) $req->get_param( 'id' );
		if ( ! $id || $id === $me || ! get_userdata( $id ) ) {
			return self::err( 'contact', 'کاربر نامعتبر است.' );
		}
		$ids = self::contact_ids( $me );
		if ( ! in_array( $id, $ids, true ) ) {
			if ( count( $ids ) >= self::MAX_CONTACTS ) {
				return self::err( 'contact_max', 'به سقف تعداد مخاطبین رسیده‌اید.' );
			}
			$ids[] = $id;
			update_user_meta( $me, 'smsg_contacts', $ids );
		}
		return self::contacts_response( $me );
	}

	public static function api_contact_remove( WP_REST_Request $req ) {
		$me  = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$ids = array_values( array_diff( self::contact_ids( $me ), array( $id ) ) );
		update_user_meta( $me, 'smsg_contacts', $ids );
		return self::contacts_response( $me );
	}

	/* --- کاربران و پیام‌ها --- */

	public static function api_users( WP_REST_Request $req ) {
		$term  = trim( (string) $req->get_param( 'search' ) );
		$uname = strtolower( ltrim( $term, '@' ) );
		if ( mb_strlen( $uname ) < 2 ) {
			return array();
		}
		$me  = get_current_user_id();
		$ids = array();

		if ( 0 !== strpos( $term, '@' ) ) {
			$q   = new WP_User_Query( array(
				'search'         => '*' . esc_attr( $term ) . '*',
				'search_columns' => array( 'display_name' ), // نه user_login و نه user_nicename (ممکن است شمارهٔ موبایل باشند)
				'exclude'        => array( $me ),
				'number'         => 20,
				'fields'         => 'ID',
			) );
			$ids = $q->get_results();
		}
		$q2  = new WP_User_Query( array(
			'meta_query' => array( array( 'key' => 'smsg_username', 'value' => $uname, 'compare' => 'LIKE' ) ),
			'exclude'    => array( $me ),
			'number'     => 20,
			'fields'     => 'ID',
		) );
		$ids = array_slice( array_unique( array_map( 'intval', array_merge( $ids, $q2->get_results() ) ) ), 0, 20 );
		return array_map( array( __CLASS__, 'user_card' ), $ids );
	}

	public static function api_conversations( WP_REST_Request $req ) {
		global $wpdb;
		$t  = self::table();
		$me = get_current_user_id();

		$rows = $wpdb->get_results( $wpdb->prepare(
			"SELECT m.* FROM {$t} m INNER JOIN (
				SELECT IF(sender_id=%d, receiver_id, sender_id) AS peer, MAX(id) AS last_id
				FROM {$t} WHERE sender_id=%d OR (receiver_id=%d AND is_blocked=0) GROUP BY peer
			) x ON m.id = x.last_id ORDER BY m.id DESC LIMIT 100",
			$me, $me, $me
		) );
		// گفتگوها در مرورگر گیرنده بارگیری شد؛ پیام‌های رسیده «دریافت‌شده» محسوب می‌شوند
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET is_delivered=1 WHERE receiver_id=%d AND is_delivered=0 AND is_blocked=0", $me ) );
		if ( '0' !== (string) $req->get_param( 'vis' ) ) {
			self::touch( $me ); // فقط وقتی تب دیده می‌شود، کاربر «آنلاین» حساب می‌شود
		}
		$unread_rows = $wpdb->get_results( $wpdb->prepare(
			"SELECT sender_id, COUNT(*) c FROM {$t} WHERE receiver_id=%d AND is_read=0 AND is_blocked=0 GROUP BY sender_id", $me
		) );
		$unread = array();
		foreach ( $unread_rows as $r ) {
			$unread[ (int) $r->sender_id ] = (int) $r->c;
		}

		$out = array();
		foreach ( $rows as $r ) {
			$peer  = (int) ( (int) $r->sender_id === $me ? $r->receiver_id : $r->sender_id );
			$out[] = array(
				'user'   => self::user_card( $peer ),
				'last'   => self::fmt( $r, false ),
				'unread' => $unread[ $peer ] ?? 0,
				'online' => ! self::is_blocked_by( $peer, $me ) && self::presence( $peer )['online'],
			);
		}
		return $out;
	}

	public static function api_get_messages( WP_REST_Request $req ) {
		global $wpdb;
		$t     = self::table();
		$me    = get_current_user_id();
		$peer  = (int) $req->get_param( 'with' );
		$after = (int) $req->get_param( 'after' );

		if ( ! $peer || ! get_userdata( $peer ) ) {
			return self::err( 'user', 'کاربر پیدا نشد.', 404 );
		}

		if ( $after > 0 ) {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$t} WHERE id > %d AND ((sender_id=%d AND receiver_id=%d) OR (sender_id=%d AND receiver_id=%d AND is_blocked=0)) ORDER BY id ASC LIMIT 100",
				$after, $me, $peer, $peer, $me
			) );
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM (SELECT * FROM {$t} WHERE (sender_id=%d AND receiver_id=%d) OR (sender_id=%d AND receiver_id=%d AND is_blocked=0) ORDER BY id DESC LIMIT 50) x ORDER BY id ASC",
				$me, $peer, $peer, $me
			) );
		}

		$wpdb->query( $wpdb->prepare(
			"UPDATE {$t} SET is_read=1, is_delivered=1 WHERE receiver_id=%d AND sender_id=%d AND is_read=0 AND is_blocked=0", $me, $peer
		) );

		return array_map( array( __CLASS__, 'fmt' ), $rows );
	}

	public static function api_send( WP_REST_Request $req ) {
		global $wpdb;
		$me  = get_current_user_id();
		$to  = (int) $req->get_param( 'to' );
		$max = (int) self::settings()['max_length'];
		$txt = trim( sanitize_textarea_field( (string) $req->get_param( 'message' ) ) );

		if ( ! $to || $to === $me || ! get_userdata( $to ) ) {
			return self::err( 'user', 'گیرنده نامعتبر است.' );
		}
		$bl = self::block_error( $me, $to );
		if ( $bl ) {
			return $bl;
		}
		if ( '' === $txt ) {
			return self::err( 'empty', 'پیام خالی است.' );
		}
		if ( mb_strlen( $txt ) > $max ) {
			return self::err( 'long', "پیام نباید بیشتر از {$max} کاراکتر باشد." );
		}

		$key   = 'smsg_rate_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 20 ) {
			return self::err( 'rate', 'تعداد پیام‌ها زیاد است. کمی صبر کنید.', 429 );
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );

		$wpdb->insert( self::table(), array(
			'sender_id'   => $me,
			'receiver_id' => $to,
			'message'     => $txt,
			'is_blocked'  => self::silent_flag( $me, $to ),
			'is_read'     => 0,
			'created_at'  => gmdate( 'Y-m-d H:i:s' ),
		), array( '%d', '%d', '%s', '%d', '%d', '%s' ) );

		delete_transient( 'smsg_act_' . $me . '_' . $to ); // با ارسال پیام، «در حال تایپ» پایان می‌یابد
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $wpdb->insert_id ) );
		return self::fmt( $row );
	}

	/* ---------- تنظیمات مدیر ---------- */

	public static function admin_menu() {
		add_menu_page( 'تنظیمات مسنجر ساده', 'مسنجر ساده', 'manage_options', 'simple-messenger', array( __CLASS__, 'settings_page' ), 'dashicons-format-chat', 58 );
	}

	public static function admin_assets( $hook ) {
		if ( 'toplevel_page_simple-messenger' !== $hook ) {
			return;
		}
		wp_enqueue_media();
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script( 'wp-color-picker' );
	}

	public static function register_settings() {
		register_setting( 'smsg_group', self::OPT, array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) ) );
	}

	public static function sanitize( $in ) {
		return array(
			'login_url'      => esc_url_raw( $in['login_url'] ?? '' ),
			'register_url'   => esc_url_raw( $in['register_url'] ?? '' ),
			'redirect_login' => empty( $in['redirect_login'] ) ? 0 : 1,
			'poll_interval'  => min( 60, max( 2, (int) ( $in['poll_interval'] ?? 4 ) ) ),
			'max_length'     => min( 5000, max( 50, (int) ( $in['max_length'] ?? 1000 ) ) ),
			'max_file_mb'    => min( 50, max( 1, (int) ( $in['max_file_mb'] ?? 10 ) ) ),
			'max_video_mb'   => min( 200, max( 1, (int) ( $in['max_video_mb'] ?? 30 ) ) ),
			'max_music_mb'   => min( 100, max( 1, (int) ( $in['max_music_mb'] ?? 20 ) ) ),
			'neshan_key'     => sanitize_text_field( $in['neshan_key'] ?? '' ),
			'block_mode'     => ( isset( $in['block_mode'] ) && 'silent' === $in['block_mode'] ) ? 'silent' : 'error',
			'map_link'       => self::clean_map_link( $in['map_link'] ?? '' ),
			'chat_bg_image'  => esc_url_raw( $in['chat_bg_image'] ?? '' ),
			'chat_bg_color'  => (string) sanitize_hex_color( $in['chat_bg_color'] ?? '' ),
		);
	}

	public static function settings_page() {
		$s = self::settings();
		$o = self::OPT; ?>
		<div class="wrap" dir="rtl">
			<h1>تنظیمات مسنجر ساده</h1>
			<p>شورت‌کد را در یک برگه قرار دهید: <code>[simple_messenger]</code> — مسنجر به‌صورت تمام‌صفحه نمایش داده می‌شود. برای نمایش داخل برگه: <code>[simple_messenger fullscreen="0"]</code></p>
			<form method="post" action="options.php">
				<?php settings_fields( 'smsg_group' ); ?>
				<h2 class="title">ورود و ثبت‌نام</h2>
				<table class="form-table">
					<tr><th>آدرس صفحه ورود پینوا</th>
						<td><input type="url" class="regular-text" style="direction:ltr" name="<?php echo esc_attr( $o ); ?>[login_url]" value="<?php echo esc_attr( $s['login_url'] ); ?>" placeholder="https://example.com/login/">
						<p class="description">آدرس برگه‌ای که فرم ورود پیامکی پینوا در آن است.</p></td></tr>
					<tr><th>آدرس صفحه ثبت‌نام</th>
						<td><input type="url" class="regular-text" style="direction:ltr" name="<?php echo esc_attr( $o ); ?>[register_url]" value="<?php echo esc_attr( $s['register_url'] ); ?>">
						<p class="description">اگر خالی بماند، همان صفحه ورود استفاده می‌شود.</p></td></tr>
					<tr><th>انتقال wp-login.php</th>
						<td><label><input type="checkbox" name="<?php echo esc_attr( $o ); ?>[redirect_login]" value="1" <?php checked( $s['redirect_login'] ); ?>> صفحه ورود وردپرس به صفحه ورود پینوا منتقل شود</label>
						<p class="description">ورود اضطراری مدیر: <code style="direction:ltr"><?php echo esc_html( site_url( 'wp-login.php?smsg_bypass=1' ) ); ?></code> — این آدرس را جایی یادداشت کنید.</p></td></tr>
				</table>

				<h2 class="title">ظاهر چت</h2>
				<table class="form-table">
					<tr><th>تصویر پس‌زمینهٔ پیش‌فرض چت</th>
						<td>
							<input type="hidden" id="smsg-bg-url" name="<?php echo esc_attr( $o ); ?>[chat_bg_image]" value="<?php echo esc_attr( $s['chat_bg_image'] ); ?>">
							<div id="smsg-bg-prev" style="width:240px;height:140px;border:1px solid #c3c4c7;border-radius:6px;background:center/cover no-repeat;margin-bottom:8px;<?php echo $s['chat_bg_image'] ? 'background-image:url(' . esc_url( $s['chat_bg_image'] ) . ');' : 'display:none;'; ?>"></div>
							<button type="button" class="button" id="smsg-bg-pick">انتخاب تصویر از رسانه</button>
							<button type="button" class="button-link-delete" id="smsg-bg-clear" style="margin-inline-start:8px">حذف تصویر</button>
							<p class="description">این پس‌زمینه برای همهٔ کاربران نمایش داده می‌شود. اگر تصویری انتخاب نشود، رنگ زیر یا گرادیان سبز پیش‌فرض استفاده می‌شود.</p>
						</td></tr>
					<tr><th>رنگ پس‌زمینه</th>
						<td><input type="text" class="smsg-color" name="<?php echo esc_attr( $o ); ?>[chat_bg_color]" value="<?php echo esc_attr( $s['chat_bg_color'] ); ?>" data-default-color="">
						<p class="description">فقط وقتی اعمال می‌شود که تصویر پس‌زمینه انتخاب نشده باشد.</p></td></tr>
				</table>

				<h2 class="title">عمومی</h2>
				<table class="form-table">
					<tr><th>فاصله بروزرسانی (ثانیه)</th>
						<td><input type="number" min="2" max="60" name="<?php echo esc_attr( $o ); ?>[poll_interval]" value="<?php echo esc_attr( $s['poll_interval'] ); ?>"></td></tr>
					<tr><th>حداکثر طول پیام</th>
						<td><input type="number" min="50" max="5000" name="<?php echo esc_attr( $o ); ?>[max_length]" value="<?php echo esc_attr( $s['max_length'] ); ?>"></td></tr>
					<tr><th>حداکثر حجم فایل و ویس (مگابایت)</th>
						<td><input type="number" min="1" max="50" name="<?php echo esc_attr( $o ); ?>[max_file_mb]" value="<?php echo esc_attr( $s['max_file_mb'] ); ?>">
						<p class="description">سقف واقعی به تنظیمات <code>upload_max_filesize</code> و <code>post_max_size</code> در PHP هم بستگی دارد. فایل‌ها در پوشهٔ خصوصی <code>uploads/smsg-private</code> نگه‌داری می‌شوند.</p></td></tr>
					<tr><th>حداکثر حجم ویدئو (مگابایت)</th>
						<td><input type="number" min="1" max="200" name="<?php echo esc_attr( $o ); ?>[max_video_mb]" value="<?php echo esc_attr( $s['max_video_mb'] ); ?>">
						<p class="description">سقف حجم برای ویدئوهای ارسالی (تصویرها از سقف «فایل و ویس» پیروی می‌کنند).</p></td></tr>
					<tr><th>حداکثر حجم موزیک (مگابایت)</th>
						<td><input type="number" min="1" max="100" name="<?php echo esc_attr( $o ); ?>[max_music_mb]" value="<?php echo esc_attr( $s['max_music_mb'] ); ?>"></td></tr>
					<tr><th>الگوی لینک «مشاهده روی نقشه»</th>
						<td><input type="text" class="regular-text" style="direction:ltr" name="<?php echo esc_attr( $o ); ?>[map_link]" value="<?php echo esc_attr( $s['map_link'] ); ?>">
						<p class="description">با <code>{lat}</code> و <code>{lng}</code> برای عرض و طول جغرافیایی. فقط آدرس‌های <code>http(s)://</code> یا <code>geo:</code> پذیرفته می‌شود. پیش‌فرض <code>geo:{lat},{lng}</code> است که در گوشی، برنامهٔ نقشهٔ نصب‌شده (مثل نشان یا بلد) را باز می‌کند. برای نسخهٔ وب می‌توانید الگوی لینک اشتراک‌گذاری نقشهٔ ایرانی دلخواه خود را بگذارید.</p></td></tr>
					<tr><th>کلید API نقشهٔ نشان (اختیاری)</th>
						<td><input type="text" class="regular-text" style="direction:ltr" autocomplete="off" name="<?php echo esc_attr( $o ); ?>[neshan_key]" value="<?php echo esc_attr( $s['neshan_key'] ); ?>">
						<p class="description">اگر کلید «نقشهٔ استاتیک» سرویس نشان (<code>platform.neshan.org</code>) را وارد کنید، در پیام موقعیت مکانی تصویر نقشه نمایش داده می‌شود. کلید فقط روی سرور استفاده می‌شود و تصویر نقشه روی سرور ذخیره (کش) می‌شود تا با قطع اینترنت بین‌المللی هم باقی بماند. اگر خالی باشد، فقط کارت مختصات نمایش داده می‌شود و هیچ سرویس بیرونی فراخوانی نمی‌شود.</p></td></tr>
				</table>
				<h2 class="title">بلاک کردن کاربران</h2>
				<table class="form-table">
					<tr><th>وقتی فرستنده بلاک شده باشد</th>
						<td>
							<label><input type="radio" name="<?php echo esc_attr( $o ); ?>[block_mode]" value="error" <?php checked( $s['block_mode'], 'error' ); ?>> خطا نمایش داده شود («امکان ارسال پیام به این کاربر وجود ندارد»)</label><br>
							<label><input type="radio" name="<?php echo esc_attr( $o ); ?>[block_mode]" value="silent" <?php checked( $s['block_mode'], 'silent' ); ?>> بی‌صدا نادیده گرفته شود: فرستنده پیام را با یک تیک می‌بیند، اما پیام هرگز به گیرنده نمی‌رسد و بدون خطاست (مثل واتساپ)</label>
							<p class="description">در حالت بی‌صدا، پیام‌های ارسالی در زمان بلاک حتی بعد از رفع بلاک هم به گیرنده نمی‌رسند. وقتی خودِ فرستنده کسی را بلاک کرده باشد، همیشه راهنمای «رفع بلاک» نمایش داده می‌شود.</p>
						</td></tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<script>
		jQuery(function ($) {
			var frame;
			$('#smsg-bg-pick').on('click', function (e) {
				e.preventDefault();
				if (!frame) {
					frame = wp.media({ title: 'انتخاب پس‌زمینهٔ چت', button: { text: 'استفاده' }, library: { type: 'image' }, multiple: false });
					frame.on('select', function () {
						var a = frame.state().get('selection').first().toJSON();
						$('#smsg-bg-url').val(a.url);
						$('#smsg-bg-prev').css('background-image', 'url(' + a.url + ')').show();
					});
				}
				frame.open();
			});
			$('#smsg-bg-clear').on('click', function (e) {
				e.preventDefault();
				$('#smsg-bg-url').val('');
				$('#smsg-bg-prev').hide();
			});
			$('.smsg-color').wpColorPicker();
		});
		</script>
		<?php
	}
}

register_activation_hook( __FILE__, array( 'SMSG_Plugin', 'activate' ) );
add_action( 'plugins_loaded', array( 'SMSG_Plugin', 'init' ) );
