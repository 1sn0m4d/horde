<?php
/**
 * Kronolith Mobile View
 *
 * Copyright 2010-2012 Horde LLC (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (LGPL). If you
 * did not receive this file, see http://www.horde.org/licenses/lgpl21.
 *
 * @author Michael J. Rubinsky <mrubinsk@horde.org>
 * @category Horde
 * @license  http://www.horde.org/licenses/gpl GPL
 * @package Kronolith
 */
require_once __DIR__ . '/lib/Application.php';
Horde_Registry::appInit('kronolith');

$title = _("My Calendar");

$view = new Horde_View(array('templatePath' => KRONOLITH_TEMPLATES . '/mobile'));
$view->today = new Horde_Date($_SERVER['REQUEST_TIME']);
$view->registry = $registry;
$view->portal = Horde::getServiceLink('portal', 'horde')->setRaw(false);
$view->logout = Horde::getServiceLink('logout')->setRaw(false);

$datejs = str_replace('_', '-', $GLOBALS['language']) . '.js';
if (!file_exists($GLOBALS['registry']->get('jsfs', 'horde') . '/date/' . $datejs)) {
    $datejs = 'en-US.js';
}
$page_output->deferScripts = false;
$page_output->addScriptFile('date/' . $datejs, 'horde');
$page_output->addScriptFile('date/date.js', 'horde');
require KRONOLITH_TEMPLATES . '/mobile/javascript_defs.php';

/* Inline script. */
$page_output->addInlineScript(
    '$(window.document).bind("mobileinit", function() {
       $.mobile.page.prototype.options.addBackBtn = true;
       $.mobile.page.prototype.options.backBtnText = "' . _("Back") .'";
       $.mobile.loadingMessage = "' . _("loading") . '";
     });',
     false,
     false,
     true
);
$page_output->header(array(
    'title' => $title,
    'view' => $registry::VIEW_SMARTMOBILE
));
$page_output->addScriptFile('mobile.js');
echo $view->render('day');
echo $view->render('event');
echo $view->render('month');
echo $view->render('summary');

$page_output->footer();
