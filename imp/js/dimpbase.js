/**
 * dimpbase.js - Javascript used in the base DIMP page.
 *
 * Copyright 2005-2011 The Horde Project (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (GPL). If you
 * did not receive this file, see http://www.fsf.org/copyleft/gpl.html.
 */

var DimpBase = {
    // Vars used and defaulting to null/false:
    //   expandfolder, folder, folderaction, folderswitch, pollPE, pp,
    //   preview_replace, qsearch_ghost, resize, rownum, search, splitbar,
    //   template, uid, viewport
    // msglist_template_horiz and msglist_template_vert set via
    //   js/mailbox-dimp.js
    cacheids: {},
    lastrow: -1,
    pivotrow: -1,
    ppcache: {},
    ppfifo: [],
    showunsub: 0,
    tcache: {},

    // Preview pane cache size is 20 entries. Given that a reasonable guess
    // of an average e-mail size is 10 KB (including headers), also make
    // an estimate that the JSON data size will be approx. 10 KB. 200 KB
    // should be a fairly safe caching value for any recent browser.
    ppcachesize: 20,

    // Message selection functions

    // id = (string) DOM ID
    // opts = (Object) Boolean options [ctrl, right, shift]
    msgSelect: function(id, opts)
    {
        var bounds,
            row = this.viewport.createSelection('domid', id),
            rownum = row.get('rownum').first(),
            sel = this.isSelected('domid', id),
            selcount = this.selectedCount();

        this.lastrow = rownum;

        // Some browsers need to stop the mousedown event before it propogates
        // down to the browser level in order to prevent text selection on
        // drag/drop actions.  Clicking on a message should always lose focus
        // from the search input, because the user may immediately start
        // keyboard navigation after that. Thus, we need to ensure that a
        // message click loses focus on the search input.
        if ($('qsearch')) {
            $('qsearch_input').blur();
        }

        if (opts.shift) {
            if (selcount) {
                if (!sel || selcount != 1) {
                    bounds = [ rownum, this.pivotrow ];
                    this.viewport.select($A($R(bounds.min(), bounds.max())));
                }
                return;
            }
        } else if (opts.ctrl) {
            this.pivotrow = rownum;
            if (sel) {
                this.viewport.deselect(row, { right: opts.right });
                return;
            } else if (opts.right || selcount) {
                this.viewport.select(row, { add: true, right: opts.right });
                return;
            }
        }

        this.viewport.select(row, { right: opts.right });
    },

    selectAll: function()
    {
        this.viewport.select($A($R(1, this.viewport.getMetaData('total_rows'))));
    },

    isSelected: function(format, data)
    {
        return this.viewport.getSelected().contains(format, data);
    },

    selectedCount: function()
    {
        return (this.viewport) ? this.viewport.getSelected().size() : 0;
    },

    resetSelected: function()
    {
        if (this.viewport) {
            this.viewport.deselect(this.viewport.getSelected(), { clearall: true });
        }
        this.toggleButtons();
        this.clearPreviewPane();
    },

    // num = (integer) See absolute.
    // absolute = (boolean) Is num an absolute row number - from 1 ->
    //            page_size (true) - or a relative change from the current
    //            selected value (false)
    //            If no current selected value, the first message in the
    //            current viewport is selected.
    // bottom = (boolean) Make selected appear at bottom?
    moveSelected: function(num, absolute, bottom)
    {
        var curr, curr_row, row, row_data, sel;

        if (absolute) {
            if (!this.viewport.getMetaData('total_rows')) {
                return;
            }
            curr = num;
        } else {
            if (num == 0) {
                return;
            }

            sel = this.viewport.getSelected();
            switch (sel.size()) {
            case 0:
                curr = this.viewport.currentOffset();
                curr += (num > 0) ? 1 : this.viewport.getPageSize('current');
                break;

            case 1:
                curr_row = sel.get('dataob').first();
                curr = curr_row.VP_rownum + num;
                break;

            default:
                sel = sel.get('rownum');
                curr = (num > 0 ? sel.max() : sel.min()) + num;
                break;
            }
            curr = (num > 0) ? Math.min(curr, this.viewport.getMetaData('total_rows')) : Math.max(curr, 1);
        }

        row = this.viewport.createSelection('rownum', curr);
        if (row.size()) {
            row_data = row.get('dataob').first();
            if (!curr_row || row_data.imapuid != curr_row.imapuid) {
                this.viewport.scrollTo(row_data.VP_rownum, { bottom: bottom });
                this.viewport.select(row, { delay: 0.3 });
            }
        } else {
            this.rownum = [ curr ];
            this.viewport.requestContentRefresh(curr - 1);
        }
    },
    // End message selection functions

    // type = (string) app, compose, mbox, menu, msg, portal, prefs, search
    //        DEFAULT: View INBOX
    // data = (mixed)
    //     'app' - (object) [app, data]
    //     'mbox' - (string) Mailbox to display
    //     'menu' - (string) Menu item to display
    //     'msg' - (string) IMAP sequence string
    //     'prefs' - (object) Extra parameters to add to prefs URL
    //     'search' - (object)
    //         'edit_query' = If 1, mailbox will be edited
    //         'mailbox' = folders to search
    //         'subfolder' = do subfolder search
    //         If not set, loads search screen with current mailbox as
    //         default search mailbox
    go: function(type, data)
    {
        var msg;

        if (!type) {
            type = 'mbox';
        }

        /* If switching from options, we need to reload page to pick up any
         * prefs changes. */
        if (type != 'prefs' &&
            $('appprefs') &&
            $('appprefs').hasClassName('on')) {
            $('dimpPage').hide();
            $('dimpLoading').show();
            this.setHash(type, data);
            window.location.reload();
            return;
        }

        if (type == 'compose') {
            return;
        }

        if (type == 'msg') {
            type = 'mbox';
            msg = DimpCore.parseRangeString(data);
            data = Object.keys(msg).first();
            this.uid = msg[data];
            // Fall through to the 'mbox' check below.
        }

        if (type == 'mbox') {
            if (Object.isUndefined(data) || data.empty()) {
                data = Object.isUndefined(this.folder)
                    ? 'INBOX'
                    : this.folder;
            }

            if (this.folder != data || !$('dimpmain_folder').visible()) {
                this.highlightSidebar(this.getFolderId(data));
                if (!$('dimpmain_folder').visible()) {
                    $('dimpmain_iframe').hide();
                    $('dimpmain_folder').show();
                }
            }

            this.loadMailbox(data);
            return;
        }

        $('dimpmain_folder').hide();
        $('dimpmain_iframe').update(DIMP.text.loading).show();

        switch (type) {
        case 'app':
            if (data.app == 'imp') {
                this.go();
                break;
            }
            this.highlightSidebar();
            this.setHash('app', data.app);
            if (data.data) {
                this.iframeContent(data.app, data.data);
            }
            break;

        case 'menu':
            this.highlightSidebar();
            this.setHash('menu', data);
            if (DIMP.conf.menu_urls[data]) {
                this.iframeContent(type, DIMP.conf.menu_urls[data]);
            }
            break;

        case 'search':
            if (!data) {
                data = { mailbox: this.folder.base64urlEncode() };
            }
            this.highlightSidebar();
            this.setTitle(DIMP.text.search);
            this.iframeContent(type, DimpCore.addURLParam(DIMP.conf.URI_SEARCH, data));
            break;

        case 'prefs':
            this.highlightSidebar('appprefs');
            this.setHash(type);
            this.setTitle(DIMP.text.prefs);
            this.iframeContent(type, DimpCore.addURLParam(DIMP.conf.URI_PREFS_IMP, data));
            break;

        case 'portal':
            this.highlightSidebar('appportal');
            this.setHash(type);
            this.setTitle(DIMP.text.portal);
            this.iframeContent(type, DIMP.conf.URI_PORTAL);
            break;
        }
    },

    setHash: function(type, data)
    {
        var h;

        if (type) {
            h = type;
            if (data) {
                h += ':' + data;
            }
        }

        window.location.hash = h
            ? h.base64urlEncode()
            : null;
    },

    setMsgHash: function()
    {
        var vs = this.viewport.getSelection(),
            view = vs.getBuffer().getView();

        if (vs.size()) {
            this.setHash('msg', DimpCore.toRangeString(DimpCore.selectionToRange(vs)));
        } else {
            this.setHash('mbox', view);
        }
    },

    setTitle: function(title)
    {
        document.title = DIMP.conf.name + ' :: ' + title;
    },

    highlightSidebar: function(id)
    {
        // Folder bar may not be fully loaded yet.
        if ($('foldersLoading').visible()) {
            this.highlightSidebar.bind(this, id).defer();
            return;
        }

        var curr = $('sidebar').down('.on'),
            elt = $(id);

        if (curr == elt) {
            return;
        }

        if (elt && !elt.match('LI')) {
            elt = elt.up();
            if (!elt) {
                return;
            }
        }

        if (curr) {
            curr.removeClassName('on');
        }

        if (elt) {
            elt.addClassName('on');
            this._toggleSubFolder(elt, 'exp');
        }
    },

    iframeContent: function(name, loc)
    {
        var container = $('dimpmain_iframe'), iframe;
        if (!container) {
            DimpCore.showNotifications([ { type: 'horde.error', message: 'Bad portal!' } ]);
            return;
        }

        iframe = new Element('IFRAME', { id: 'iframe' + (name === null ? loc : name), className: 'iframe', frameBorder: 0, src: loc }).setStyle({ height: document.viewport.getHeight() + 'px' });
        container.insert(iframe);
    },

    // r = ViewPort row data
    msgWindow: function(r)
    {
        var url = DIMP.conf.URI_MESSAGE;
        url += (url.include('?') ? '&' : '?') +
               $H({ mailbox: r.view.base64urlEncode(),
                    uid: r.imapuid }).toQueryString();
        DimpCore.popupWindow(url, 'msgview' + r.view + r.imapuid);
    },

    composeMailbox: function(type)
    {
        var sel = this.viewport.getSelected();
        if (sel.size()) {
            DimpCore.compose(type, { uids: sel });
        }
    },

    loadMailbox: function(f, opts)
    {
        var need_delete;
        opts = opts || {};

        if (!this.viewport) {
            this._createViewPort();
        }

        if (!opts.background) {
            this.resetSelected();
            this.quicksearchClear(true);

            if (this.folder != f) {
                $('folderName').update(DIMP.text.loading);
                $('msgHeader').update();
                this.folderswitch = true;

                /* Don't cache results of search folders - since we will need
                 * to grab new copy if we ever return to it. */
                if (this.isSearch(this.folder)) {
                    need_delete = this.folder;
                }

                this.folder = f;

                if (!this.isSearch(f)) {
                    $('searchbar').hide();
                } else if (!this.search || !this.search.qsearch) {
                    $('qsearch').hide();
                }
            }
        }

        this.viewport.loadView(f, { search: (this.uid ? { imapuid: this.uid.first() } : null), background: opts.background});

        if (need_delete) {
            this.viewport.deleteView(need_delete);
        }
    },

    _createViewPort: function()
    {
        var container = $('msgSplitPane');

        this.template = {
            horiz: new Template(this.msglist_template_horiz),
            vert: new Template(this.msglist_template_vert)
        };

        this.viewport = new ViewPort({
            // Mandatory config
            ajax_url: DIMP.conf.URI_AJAX + 'viewPort',
            container: container,
            onContent: function(r, mode) {
                var bg, re, u,
                    thread = $H(this.viewport.getMetaData('thread')),
                    tsort = (this.viewport.getMetaData('sortby') == $H(DIMP.conf.sort).get('thread').v);

                r.subjectdata = r.status = '';
                r.subjecttitle = r.subject;

                // Add thread graphics
                if (tsort && mode != 'vert') {
                    u = thread.get(r.imapuid);
                    if (u) {
                        $R(0, u.length, true).each(function(i) {
                            var c = u.charAt(i);
                            if (!this.tcache[c]) {
                                this.tcache[c] = '<span class="treeImg treeImg' + c + '"></span>';
                            }
                            r.subjectdata += this.tcache[c];
                        }, this);
                    }
                }

                /* Generate the status flags. */
                if (r.flag) {
                    r.flag.each(function(a) {
                        var ptr = DIMP.conf.flags[a];
                        if (ptr.u) {
                            if (!ptr.elt) {
                                /* Until text-overflow is supported on all
                                 * browsers, need to truncate label text
                                 * ourselves. */
                                ptr.elt = '<span class="' + ptr.c + '" title="' + ptr.l + '" style="background:' + ptr.b + ';color:' + ptr.f + '">' + ptr.l.truncate(10) + '</span>';
                            }
                            r.subjectdata += ptr.elt;
                        } else {
                            if (ptr.c) {
                                if (!ptr.elt) {
                                    ptr.elt = '<div class="iconImg msgflags ' + ptr.c + '" title="' + ptr.l + '"></div>';
                                }
                                r.status += ptr.elt;

                                r.VP_bg.push(ptr.c);
                            }

                            if (ptr.b) {
                                bg = ptr.b;
                            }
                        }
                    });
                }

                // Set bg
                if (bg) {
                    r.style = 'background:' + bg;
                }

                // Check for search strings
                if (this.isSearch(null, true)) {
                    re = new RegExp("(" + $F('qsearch_input') + ")", "i");
                    [ 'from', 'subject' ].each(function(h) {
                        if (r[h] !== null) {
                            r[h] = r[h].gsub(re, '<span class="qsearchMatch">#{1}</span>');
                        }
                    });
                }

                // If these fields are null, invalid string was scrubbed by
                // JSON encode.
                if (r.from === null) {
                    r.from = '[' + DIMP.text.badaddr + ']';
                }
                if (r.subject === null) {
                    r.subject = r.subjecttitle = '[' + DIMP.text.badsubject + ']';
                }

                r.VP_bg.push('vpRow');

                switch (mode) {
                case 'vert':
                    $('msglistHeaderHoriz').hide();
                    $('msglistHeaderVert').show();
                    r.VP_bg.unshift('vpRowVert');
                    r.className = r.VP_bg.join(' ');
                    return this.template.vert.evaluate(r);

                default:
                    $('msglistHeaderVert').hide();
                    $('msglistHeaderHoriz').show();
                    r.VP_bg.unshift('vpRowHoriz');
                    r.className = r.VP_bg.join(' ');
                    return this.template.horiz.evaluate(r);
                }
            }.bind(this),

            // Optional config
            ajax_opts: Object.clone(DimpCore.doActionOpts),
            buffer_pages: DIMP.conf.buffer_pages,
            empty_msg: DIMP.text.vp_empty,
            list_class: 'msglist',
            list_header: $('msglistHeaderContainer').remove(),
            page_size: DIMP.conf.splitbar_pos,
            pane_data: 'previewPane',
            pane_mode: DIMP.conf.preview_pref,
            split_bar_class: { horiz: 'splitBarHoriz', vert: 'splitBarVert' },
            wait: DIMP.conf.viewport_wait,

            // Callbacks
            onAjaxFailure: function() {
                if ($('dimpmain_folder').visible()) {
                    DimpCore.showNotifications([ { type: 'horde.error', message: DIMP.text.listmsg_timeout } ]);
                }
                this.loadingImg('viewport', false);
            }.bind(this),
            onAjaxRequest: function(id) {
                var p = $H();
                if (this.folderswitch && this.isSearch(id, true)) {
                    p.set('qsearchmbox', this.search.mbox);
                    if (this.search.filter) {
                        p.update({
                            qsearchfilter: this.search.filter
                        });
                    } else if (this.search.flag) {
                        p.update({
                            qsearchflag: this.search.flag,
                            qsearchflagnot: Number(this.search.not)
                        });
                    } else {
                        p.set('qsearch', $F('qsearch_input'));
                    }
                }
                return DimpCore.addRequestParams(p);
            }.bind(this),
            onAjaxResponse: function(o, h) {
                DimpCore.doActionComplete(o);
            },
            onCachedList: function(id) {
                if (!this.cacheids[id]) {
                    var vs = this.viewport.createSelectionBuffer(id);
                    if (!vs.size()) {
                        return '';
                    }

                    this.cacheids[id] = DimpCore.toRangeString(DimpCore.selectionToRange(vs));
                }
                return this.cacheids[id];
            }.bind(this),
            onContentOffset: function(offset) {
                if (this.uid) {
                    var row = this.viewport.createSelectionBuffer().search({ imapuid: { equal: this.uid }, view: { equal: [ this.folder ] } });
                    if (row.size()) {
                        this.rownum = row.get('rownum');
                    }
                    this.uid = null;
                }

                if (this.rownum) {
                    this.viewport.scrollTo(this.rownum.first(), { noupdate: true, top: true });
                    offset = this.viewport.currentOffset();
                }

                return offset;
            }.bind(this),
            onSlide: this.setMessageListTitle.bind(this)
        });

        /* Custom ViewPort events. */
        container.observe('ViewPort:add', function(e) {
            var row = e.memo.identify();
            DimpCore.addContextMenu({
                id: row,
                type: 'message'
            });
            new Drag(row, this._msgDragConfig);
        }.bindAsEventListener(this));

        container.observe('ViewPort:cacheUpdate', function(e) {
            delete this.cacheids[e.memo];
        }.bindAsEventListener(this));

        container.observe('ViewPort:clear', function(e) {
            this._removeMouseEvents(e.memo);
        }.bindAsEventListener(this));

        container.observe('ViewPort:contentComplete', function() {
            var flags, ssc, tmp,
                ham = spam = 'show',
                l = this.viewport.getMetaData('label');

            this.setMessageListTitle();
            this.setMsgHash();

            if (this.isSearch()) {
                tmp = this.viewport.getMetaData('slabel');
                if (this.viewport.getMetaData('vfolder')) {
                    $('search_close').hide();
                    if (tmp) {
                        tmp = DIMP.text.vfolder.sub('%s', tmp);
                    }
                } else {
                    $('search_close').show();
                }

                if (tmp) {
                    tmp = tmp.stripTags();
                    $('search_label').writeAttribute({ title: tmp.escapeHTML() });
                    if (tmp.length > 250) {
                        tmp = tmp.truncate(250);
                    }
                    $('search_label').update(tmp.escapeHTML());
                }
                [ $('search_edit') ].invoke(this.search || this.viewport.getMetaData('noedit') ? 'hide' : 'show');
                $('searchbar').show();
            } else {
                this.setFolderLabel(this.folder);
            }

            if (this.rownum) {
                this.viewport.select(this.rownum);
                this.rownum = null;
            }

            this.updateTitle(true);

            if (this.folderswitch) {
                this.folderswitch = false;

                tmp = $('applyfilterlink');
                if (tmp) {
                    if (this.isSearch() ||
                        (!DIMP.conf.filter_any &&
                         this.folder.toUpperCase() != 'INBOX')) {
                        tmp.hide();
                    } else {
                        tmp.show();
                    }

                    this._sizeFolderlist();
                }

                if (this.viewport.getMetaData('drafts')) {
                    $('button_resume').show();
                    $('button_reply', 'button_forward', 'button_spam', 'button_ham').compact().invoke('up').invoke('hide');
                } else {
                    $('button_resume').hide();
                    $('button_reply', 'button_forward').compact().invoke('up').invoke('show');

                    if (this.viewport.getMetaData('spam')) {
                        if (!DIMP.conf.spam_spammbox) {
                            spam = 'hide';
                        }
                    } else if (DIMP.conf.ham_spammbox) {
                        ham = 'hide';
                    }

                    if ($('button_ham')) {
                        [ $('button_ham').up(), $('ctx_message_ham') ].invoke(ham);
                    }
                    if ($('button_spam')) {
                        [ $('button_spam').up(), $('ctx_message_spam') ].invoke(spam);
                    }
                }

                /* Read-only changes. 'oa_setflag' is handled elsewhere. */
                tmp = [ $('ctx_message_setflag') ].compact();
                if (this.viewport.getMetaData('readonly')) {
                    tmp.invoke('hide');
                    $('folderName').next().show();
                } else {
                    tmp.invoke('show');
                    $('folderName').next().hide();
                }

                /* ACL changes. */
                [ $('button_deleted') ].compact().invoke('up').concat($('ctx_message_deleted', 'ctx_message_undeleted')).compact().invoke(this.viewport.getMetaData('nodelete') ? 'hide' : 'show');
                [ $('oa_purge_deleted') ].compact().invoke(this.viewport.getMetaData('noexpunge') ? 'hide' : 'show');
            } else if (this.filtertoggle &&
                       this.viewport.getMetaData('sortby') == $H(DIMP.conf.sort).get('thread').v) {
                ssc = $H(DIMP.conf.sort).get('date').v;
            }

            this.setSortColumns(ssc);

            /* Context menu: generate the list of settable flags for this
             * mailbox. */
            flags = this.viewport.getMetaData('flags');
            $('ctx_message_setflag', 'oa_setflag').invoke('up').invoke(flags.size() ? 'show' : 'hide');
            if (flags.size()) {
                $('ctx_flag').childElements().each(function(c) {
                    [ c ].invoke(flags.include(c.retrieve('flag')) ? 'show' : 'hide');
                });
            } else {
                $('ctx_flag').childElements().invoke('show');
            }
        }.bindAsEventListener(this));

        container.observe('ViewPort:deselect', function(e) {
            var sel = this.viewport.getSelected(),
                count = sel.size();
            if (!count) {
                this.lastrow = this.pivotrow = -1;
            }

            this.toggleButtons();
            if (e.memo.opts.right || !count) {
                if (!this.preview_replace) {
                    this.clearPreviewPane();
                }
            } else if ((count == 1) && DIMP.conf.preview_pref) {
                this.loadPreview(sel.get('dataob').first());
            }

            this.setMsgHash();
        }.bindAsEventListener(this));

        container.observe('ViewPort:endFetch', this.loadingImg.bind(this, 'viewport', false));

        container.observe('ViewPort:fetch', this.loadingImg.bind(this, 'viewport', true));

        container.observe('ViewPort:select', function(e) {
            var d = e.memo.vs.get('rownum');
            if (d.size() == 1) {
                this.lastrow = this.pivotrow = d.first();
            }

            this.setMsgHash();

            this.toggleButtons();

            if (DIMP.conf.preview_pref) {
                if (e.memo.opts.right) {
                    this.clearPreviewPane();
                } else if (e.memo.opts.delay) {
                    this.initPreviewPane.bind(this).delay(e.memo.opts.delay);
                } else {
                    this.initPreviewPane();
                }
            }
        }.bindAsEventListener(this));

        container.observe('ViewPort:splitBarChange', function(e) {
            if (e.memo = 'horiz') {
                this._updatePrefs('dimp_splitbar', this.viewport.getPageSize());
            }
        }.bindAsEventListener(this));

        container.observe('ViewPort:wait', function() {
            if ($('dimpmain_folder').visible()) {
                DimpCore.showNotifications([ { type: 'horde.warning', message: DIMP.text.listmsg_wait } ]);
            }
        });
    },

    _removeMouseEvents: function(elt)
    {
        var d, id = $(elt).readAttribute('id');

        if (id) {
            if (d = DragDrop.Drags.getDrag(id)) {
                d.destroy();
            }

            DimpCore.DMenu.removeElement(id);
        }
    },

    contextOnClick: function(parentfunc, e)
    {
        var tmp,
            elt = e.memo.elt,
            id = elt.readAttribute('id'),
            menu = e.memo.trigger;

        switch (id) {
        case 'ctx_container_create':
        case 'ctx_folder_create':
            tmp = e.findElement('LI');
            DimpCore.doAction('createMailboxPrepare', {
                mbox: tmp.retrieve('mbox')
            },{
                callback: this._mailboxPromptCallback.bind(this, 'create', { elt: tmp, orig_elt: e.element() })
            });
            break;

        case 'ctx_container_rename':
        case 'ctx_folder_rename':
            tmp = e.findElement('LI');
            DimpCore.doAction('deleteMailboxPrepare', {
                mbox: tmp.retrieve('mbox'),
                type: 'rename'
            },{
                callback: this._mailboxPromptCallback.bind(this, 'rename', { elt: tmp })
            });
            break;

        case 'ctx_folder_empty':
            tmp = e.findElement('LI');
            DimpCore.doAction('emptyMailboxPrepare', {
                mbox: tmp.retrieve('mbox')
            },{
                callback: this._mailboxPromptCallback.bind(this, 'empty', { elt: tmp })
            });
            break;

        case 'ctx_folder_delete':
        case 'ctx_vfolder_delete':
            tmp = e.findElement('LI');
            DimpCore.doAction('deleteMailboxPrepare', {
                mbox: tmp.retrieve('mbox'),
                type: 'delete'
            },{
                callback: this._mailboxPromptCallback.bind(this, 'delete', { elt: tmp })
            });
            break;

        case 'ctx_folder_export_mbox':
        case 'ctx_folder_export_zip':
            tmp = e.findElement('LI');

            this.folderaction = DimpCore.redirect.bind(DimpCore, DimpCore.addURLParam(DIMP.conf.URI_VIEW, {
                actionID: 'download_mbox',
                mailbox: tmp.retrieve('mbox'),
                zip: Number(id == 'ctx_folder_export_zip')
            }));

            IMPDialog.display({
                cancel_text: DIMP.text.cancel,
                noinput: true,
                ok_text: DIMP.text.ok,
                text: DIMP.text.download_folder
            });
            break;

        case 'ctx_folder_import':
            tmp = e.findElement('LI').retrieve('mbox');

            IMPDialog.display({
                cancel_text: DIMP.text.cancel,
                form: new Element('DIV').insert(
                          new Element('INPUT', { name: 'import_file', type: 'file' })
                      ).insert(
                          new Element('INPUT', { name: 'import_mbox', value: tmp }).hide()
                      ),
                form_id: 'mbox_import',
                form_opts: {
                    action: DIMP.conf.URI_AJAX + 'importMailbox',
                    className: 'RBForm',
                    enctype: 'multipart/form-data',
                    method: 'post',
                    name: 'mbox_import',
                    target: 'submit_frame'
                },
                ok_text: DIMP.text.ok,
                text: DIMP.text.import_mbox
            });
            break;

        case 'ctx_folder_seen':
        case 'ctx_folder_unseen':
            DimpCore.doAction('flagAll', {
                add: Number(id == 'ctx_folder_seen'),
                flags: Object.toJSON([ DIMP.conf.FLAG_SEEN ]),
                mbox: e.findElement('LI').retrieve('mbox')
            });
            break;

        case 'ctx_folder_poll':
        case 'ctx_folder_nopoll':
            this.modifyPoll(e.findElement('LI').retrieve('mbox'), id == 'ctx_folder_poll');
            break;

        case 'ctx_folder_sub':
        case 'ctx_folder_unsub':
            this.subscribeFolder(e.findElement('LI').retrieve('mbox'), id == 'ctx_folder_sub');
            break;

        case 'ctx_folderopts_new':
            this.createBaseFolder();
            break;

        case 'ctx_folderopts_sub':
        case 'ctx_folderopts_unsub':
            this.toggleSubscribed();
            break;

        case 'ctx_folderopts_expand':
        case 'ctx_folderopts_collapse':
            this._toggleSubFolder($('normalfolders'), id == 'ctx_folderopts_expand' ? 'expall' : 'colall', true);
            break;

        case 'ctx_folderopts_reload':
            this._reloadFolders();
            break;

        case 'ctx_container_expand':
        case 'ctx_container_collapse':
        case 'ctx_folder_expand':
        case 'ctx_folder_collapse':
            this._toggleSubFolder(e.findElement('LI').next(), (id == 'ctx_container_expand' || id == 'ctx_folder_expand') ? 'expall' : 'colall', true);
            break;

        case 'ctx_container_search':
        case 'ctx_container_searchsub':
        case 'ctx_folder_search':
        case 'ctx_folder_searchsub':
            this.go('search', {
                mailbox: e.findElement('LI').retrieve('mbox').base64urlEncode(),
                subfolder: Number(id.endsWith('searchsub'))
            });
            break;

        case 'ctx_message_spam':
        case 'ctx_message_ham':
            this.reportSpam(id == 'ctx_message_spam');
            break;

        case 'ctx_message_blacklist':
        case 'ctx_message_whitelist':
            this.blacklist(id == 'ctx_message_blacklist');
            break;

        case 'ctx_message_deleted':
            this.deleteMsg();
            break;

        case 'ctx_message_forward':
        case 'ctx_message_reply':
            this.composeMailbox(id == 'ctx_message_forward' ? 'forward_auto' : 'reply_auto');
            break;

        case 'ctx_message_source':
            this.viewport.getSelected().get('dataob').each(function(v) {
                DimpCore.popupWindow(DimpCore.addURLParam(DIMP.conf.URI_VIEW, { uid: v.imapuid, mailbox: v.view.base64urlEncode(), actionID: 'view_source', id: 0 }, true), v.imapuid + '|' + v.view);
            }, this);
            break;

        case 'ctx_message_resume':
            this.composeMailbox('resume');
            break;

        case 'ctx_message_view':
            this.viewport.getSelected().get('dataob').each(this.msgWindow.bind(this));
            break;

        case 'ctx_reply_reply':
        case 'ctx_reply_reply_all':
        case 'ctx_reply_reply_list':
            this.composeMailbox(id.substring(10));
            break;

        case 'ctx_forward_attach':
        case 'ctx_forward_body':
        case 'ctx_forward_both':
        case 'ctx_forward_redirect':
            this.composeMailbox(id.substring(4));
            break;

        case 'oa_preview_hide':
            DIMP.conf.preview_pref_old = DIMP.conf.preview_pref;
            this.togglePreviewPane('');
            break;

        case 'oa_preview_show':
            this.togglePreviewPane(DIMP.conf.preview_pref_old || 'horiz');
            break;

        case 'oa_layout_horiz':
        case 'oa_layout_vert':
            this.togglePreviewPane(id.substring(10));
            break;

        case 'oa_blacklist':
        case 'oa_whitelist':
            this.blacklist(id == 'oa_blacklist');
            break;

        case 'ctx_message_undeleted':
        case 'oa_undeleted':
            this.flag(DIMP.conf.FLAG_DELETED, false);
            break;

        case 'oa_purge_deleted':
            this.purgeDeleted();
            break;

        case 'oa_help':
            this.toggleHelp();
            break;

        case 'oa_sort_from':
        case 'oa_sort_date':
        case 'oa_sort_size':
        case 'oa_sort_subject':
        case 'oa_sort_thread':
            this.sort(DIMP.conf.sort.get(id.substring(8)).v);
            break;

        case 'ctx_vfolder_edit':
            tmp = {
                edit_query: 1,
                mailbox: e.findElement('LI').retrieve('mbox').base64urlEncode()
            };
            // Fall through

        case 'ctx_qsearchopts_advanced':
            this.go('search', tmp);
            break;

        case 'ctx_vcontainer_edit':
            this.go('prefs', { group: 'searches' });
            break;

        case 'ctx_qsearchby_all':
        case 'ctx_qsearchby_body':
        case 'ctx_qsearchby_from':
        case 'ctx_qsearchby_recip':
        case 'ctx_qsearchby_subject':
            DIMP.conf.qsearchfield = id.substring(14);
            this._updatePrefs('dimp_qsearch_field', DIMP.conf.qsearchfield);
            this._setQsearchText();
            break;

        case 'ctx_mboxsort_none':
            this.sort($H(DIMP.conf.sort).get('sequence').v);
            break;

        default:
            if (menu == 'ctx_qsearchopts_filter') {
                this.search = {
                    filter: elt.retrieve('filter'),
                    label: this.viewport.getMetaData('label'),
                    mbox: this.folder
                }
                this.go('mbox', DIMP.conf.fsearchid);
            } else if (menu.endsWith('_setflag')) {
                tmp = elt.down('DIV');
                this.flag(elt.retrieve('flag'), !tmp.visible() || tmp.hasClassName('msCheck'));
            } else if (menu.endsWith('_unsetflag')) {
                this.flag(elt.retrieve('flag'), false);
            } else if (menu.endsWith('_flag') || menu.endsWith('_flagnot')) {
                this.search = {
                    flag: elt.retrieve('flag'),
                    label: this.viewport.getMetaData('label'),
                    mbox: this.folder,
                    not: menu.endsWith('_flagnot')
                };
                this.go('mbox', DIMP.conf.fsearchid);
            } else {
                parentfunc(e);
            }
            break;
        }
    },

    contextOnShow: function(parentfunc, e)
    {
        var baseelt, elts, flags, ob, sel, tmp,
            ctx_id = e.memo;

        switch (ctx_id) {
        case 'ctx_folder':
            elts = $('ctx_folder_create', 'ctx_folder_rename', 'ctx_folder_delete');
            baseelt = e.findElement('LI');

            if (baseelt.retrieve('mbox') == 'INBOX') {
                elts.invoke('hide');
                if ($('ctx_folder_sub')) {
                    $('ctx_folder_sub', 'ctx_folder_unsub').invoke('hide');
                }
            } else {
                if ($('ctx_folder_sub')) {
                    tmp = baseelt.hasClassName('unsubFolder');
                    [ $('ctx_folder_sub') ].invoke(tmp ? 'show' : 'hide');
                    [ $('ctx_folder_unsub') ].invoke(tmp ? 'hide' : 'show');
                }

                if (DIMP.conf.fixed_folders &&
                    DIMP.conf.fixed_folders.indexOf(baseelt.retrieve('mbox')) != -1) {
                    elts.shift();
                    elts.invoke('hide');
                } else {
                    elts.invoke('show');
                }
            }

            tmp = Object.isUndefined(baseelt.retrieve('u'));
            [ $('ctx_folder_poll') ].invoke(tmp ? 'show' : 'hide');
            [ $('ctx_folder_nopoll') ].invoke(tmp ? 'hide' : 'show');

            tmp = $(this.getSubFolderId(baseelt.readAttribute('id')));
            [ $('ctx_folder_expand').up() ].invoke(tmp ? 'show' : 'hide');

            // Fall-through

        case 'ctx_container':
        case 'ctx_noactions':
        case 'ctx_vfolder':
            baseelt = e.findElement('LI');
            $(ctx_id).down('DIV.folderName').update(baseelt.readAttribute('title'));
            break;

        case 'ctx_reply':
            sel = this.viewport.getSelected();
            if (sel.size() == 1) {
                ob = sel.get('dataob').first();
            }
            [ $('ctx_reply_reply_list') ].invoke(ob && ob.listmsg ? 'show' : 'hide');
            break;

        case 'ctx_otheractions':
            switch (DIMP.conf.preview_pref) {
            case 'vert':
                $('oa_preview_hide', 'oa_layout_horiz').invoke('show');
                $('oa_preview_show', 'oa_layout_vert').invoke('hide');
                break;

            case 'horiz':
                $('oa_preview_hide', 'oa_layout_vert').invoke('show');
                $('oa_preview_show', 'oa_layout_horiz').invoke('hide');
                break;

            default:
                $('oa_preview_hide', 'oa_layout_horiz', 'oa_layout_vert').invoke('hide');
                $('oa_preview_show').show();
                break;
            }

            tmp = [ $('oa_undeleted') ];
            $('oa_blacklist', 'oa_whitelist').each(function(o) {
                if (o) {
                    tmp.push(o.up());
                }
            });

            sel = this.viewport.getSelected();

            if ($('oa_setflag')) {
                if (this.viewport.getMetaData('readonly')) {
                    $('oa_setflag').up().hide();
                } else {
                    tmp.push($('oa_setflag').up());
                    [ $('oa_unsetflag') ].invoke((sel.size() > 1) ? 'show' : 'hide');
                }
            }

            tmp.compact().invoke(sel.size() ? 'show' : 'hide');

            if (tmp = $('oa_purge_options')) {
                [ tmp ].invoke(tmp.select('> a').any(Element.visible) ? 'show' : 'hide');
            }
            break;

        case 'ctx_sortopts':
            elts = $(ctx_id).select('a span.iconImg');
            tmp = this.viewport.getMetaData('sortby');

            elts.each(function(e) {
                e.removeClassName('sortdown').removeClassName('sortup');
            });

            $H(DIMP.conf.sort).detect(function(s) {
                if (s.value.v == tmp) {
                    $('oa_sort_' + s.key).down('.iconImg').addClassName(this.viewport.getMetaData('sortdir') ? 'sortup' : 'sortdown');
                    return true;
                }
            }, this);
            break;

        case 'ctx_qsearchby':
            $(ctx_id).descendants().invoke('removeClassName', 'contextSelected');
            $(ctx_id + '_' + DIMP.conf.qsearchfield).addClassName('contextSelected');
            break;

        case 'ctx_message':
            [ $('ctx_message_source').up() ].invoke(DIMP.conf.preview_pref ? 'hide' : 'show');
            sel = this.viewport.getSelected();
            if (sel.size() == 1) {
                [ $('ctx_message_resume').up('DIV') ].invoke(this.isDraft(sel) ? 'show' : 'hide');
                [ $('ctx_message_unsetflag') ].compact().invoke('hide');
            } else {
                $('ctx_message_resume').up('DIV').hide();
                [ $('ctx_message_unsetflag') ].compact().invoke('show');
            }
            break;

        case 'ctx_flag':
            sel = this.viewport.getSelected();
            flags = (sel.size() == 1)
                ? sel.get('dataob').first().flag
                : null;

            $(ctx_id).childElements().each(function(elt) {
                var a, r;
                if (flags === null) {
                    elt.down('DIV').hide();
                } else {
                    if (flags.include(elt.retrieve('flag'))) {
                        a = 'msCheckOn';
                        r = 'msCheck';
                    } else {
                        a = 'msCheck';
                        r = 'msCheckOn';
                    }
                    elt.down('DIV').removeClassName(r).addClassName(a).show();
                }
            });
            break;

        default:
            parentfunc(e);
            break;
        }
    },

    contextAddFilter: function(filter, label)
    {
        var a = new Element('A').insert(label.escapeHTML());
        $('ctx_filter').insert(a);
        a.store('filter', filter);
    },

    contextAddFlag: function(flag, f, id)
    {
        var a = new Element('A'),
            style = {};

        if (id == 'ctx_flag') {
            a.insert(new Element('DIV', { className: 'iconImg' }));
        }

        if (f.u) {
            style.backgroundColor = f.b.escapeHTML();
        }

        $(id).insert(
            a.insert(
                new Element('SPAN', { className: 'iconImg' }).addClassName(f.i ? f.i.escapeHTML() : f.c.escapeHTML()).setStyle(style)
            ).insert(
                f.l.escapeHTML()
            )
        );

        a.store('flag', flag);
    },

    updateTitle: function(foldername)
    {
        var elt, flabel, unseen,
            label = this.viewport.getMetaData('label');

        // 'label' will not be set if there has been an error
        // retrieving data from the server.
        if (!label || !$('dimpmain_folder').visible()) {
            return;
        }

        if (this.isSearch()) {
            if (this.isSearch(null, true)) {
                label += ' (' + this.search.label + ')';
            }
        } else if (elt = $(this.getFolderId(this.folder))) {
            unseen = elt.retrieve('u');
            if (unseen > 0) {
                flabel = label;
                label += ' (' + unseen + ')';
            }
        }

        // Label is HTML encoded - but this is not HTML code so unescape.
        this.setTitle(label.unescapeHTML());
        if (foldername) {
            $('folderName').update(flabel ? flabel : label);
        }
    },

    sort: function(sortby)
    {
        var s;

        if (Object.isUndefined(sortby)) {
            return;
        }

        sortby = Number(sortby);
        if (sortby == this.viewport.getMetaData('sortby')) {
            s = { sortdir: (this.viewport.getMetaData('sortdir') ? 0 : 1) };
            this.viewport.setMetaData({ sortdir: s.sortdir });
        } else {
            s = { sortby: sortby };
            this.viewport.setMetaData({ sortby: s.sortby });
        }

        this.setSortColumns(sortby);
        this.viewport.reload(s);
    },

    setSortColumns: function(sortby)
    {
        var hdr, tmp,
            ptr = DIMP.conf.sort,
            m = $('msglistHeaderHoriz');

        if (Object.isUndefined(sortby)) {
            sortby = this.viewport.getMetaData('sortby');
        }

        /* Init once per load. */
        if (Object.isHash(ptr)) {
            m.childElements().invoke('removeClassName', 'sortup').invoke('removeClassName', 'sortdown');
        } else {
            DIMP.conf.sort = ptr = $H(ptr);
            ptr.each(function(s) {
                s.value.e = new Element('A', { className: 'widget' }).store('sortby', s.value.v).insert(s.value.t);
            }, this);

            m.down('.msgFrom').update(ptr.get('from').e).insert(ptr.get('to').e);
            m.down('.msgSize').update(ptr.get('size').e);
            m.down('.msgDate').update(ptr.get('date').e);
        }

        /* Toggle between From/To header. */
        tmp = m.down('.msgFrom a');
        if (this.viewport.getMetaData('special')) {
            tmp.hide().next().show();
        } else {
            tmp.show().next().hide();
        }

        /* Toggle between Subject/Thread header. */
        tmp = m.down('.msgSubject');
        if (this.isSearch() ||
            this.viewport.getMetaData('nothread')) {
            hdr = { l: ptr.get('subject') };
        } else if (sortby == ptr.get('thread').v) {
            hdr = { l: ptr.get('thread'), s: ptr.get('subject') };
        } else {
            hdr = { l: ptr.get('subject'), s: ptr.get('thread') };
        }

        // Needed due to IE 7 buggy behavior (Bug #9734).
        if (Prototype.Browser.IE) {
            tmp.update('');
        }
        tmp.update(hdr.l.e.removeClassName('smallSort').update(hdr.l.t));
        hdr.l.e.store('sortby', hdr.l.v);
        if (hdr.s) {
            tmp.insert(hdr.s.e.store('sortby', hdr.s.v).addClassName('smallSort').update('[' + hdr.s.t + ']'));
        }

        ptr.find(function(s) {
            if (sortby != s.value.v) {
                return false;
            }
            var elt = s.value.e.up();
            if (elt) {
                elt.addClassName(this.viewport.getMetaData('sortdir') ? 'sortup' : 'sortdown');
            }
            return true;
        }, this);
    },

    // Preview pane functions
    // mode = (string) Either 'horiz', 'vert', or empty
    togglePreviewPane: function(mode)
    {
        var old = DIMP.conf.preview_pref;
        if (mode != DIMP.conf.preview_pref) {
            DIMP.conf.preview_pref = mode;
            this._updatePrefs('dimp_show_preview', mode);
            this.viewport.showSplitPane(mode);
            if (!old) {
                this.initPreviewPane();
            }
        }
    },

    loadPreview: function(data, params)
    {
        var pp_uid;

        if (!DIMP.conf.preview_pref) {
            return;
        }

        if (!params) {
            if (this.pp &&
                this.pp.imapuid == data.imapuid &&
                this.pp.view == data.view) {
                return;
            }
            this.pp = data;
            pp_uid = this._getPPId(data.imapuid, data.view);

            if (this.ppfifo.indexOf(pp_uid) != -1) {
                this.flag('\\seen', true, { mailbox: data.view, uid: data.imapuid });
                return this._loadPreviewCallback(this.ppcache[pp_uid]);
            }
        }

        this.loadingImg('msg', true);

        DimpCore.doAction('showPreview', this.viewport.addRequestParams(params || {}), { uids: this.viewport.createSelection('dataob', this.pp), callback: this._loadPreviewCallback.bind(this) });
    },

    _loadPreviewCallback: function(resp)
    {
        var bg, ppuid, tmp, vs,
            pm = $('previewMsg'),
            r = resp.response.preview,
            t = $('msgHeadersContent').down('THEAD');

        bg = (this.pp &&
              (this.pp.imapuid != r.uid || this.pp.view != r.mailbox));

        if (r.error || this.viewport.getSelected().size() != 1) {
            if (!bg) {
                if (r.error) {
                    DimpCore.showNotifications([ { type: r.errortype, message: r.error } ]);
                }
                this.clearPreviewPane();
            }
            return;
        }

        vs = this.viewport.getSelection();

        // Store in cache.
        ppuid = this._getPPId(r.uid, r.mailbox);
        this._expirePPCache([ ppuid ]);
        this.ppcache[ppuid] = resp;
        this.ppfifo.push(ppuid);

        if (bg) {
            return;
        }

        DimpCore.removeAddressLinks(pm);

        // Add subject
        tmp = pm.select('.subject');
        tmp.invoke('update', r.subject === null ? '[' + DIMP.text.badsubject + ']' : r.subject);

        // Add date
        [ $('msgHeadersColl').select('.date'), $('msgHeaderDate').select('.date') ].flatten().invoke('update', r.localdate);

        // Add from/to/cc/bcc headers
        [ 'from', 'to', 'cc', 'bcc' ].each(function(a) {
            if (r[a]) {
                (a == 'from' ? pm.select('.' + a) : [ t.down('.' + a) ]).each(function(elt) {
                    elt.replace(DimpCore.buildAddressLinks(r[a], elt.clone(false)));
                });
            }
            [ $('msgHeader' + a.capitalize()) ].invoke(r[a] ? 'show' : 'hide');
        });

        // Add attachment information
        if (r.atc_label) {
            $('msgAtc').show();
            tmp = $('partlist');
            tmp.previous().update(new Element('SPAN', { className: 'atcLabel' }).insert(r.atc_label)).insert(r.atc_download);
            if (r.atc_list) {
                $('partlist_col').show();
                $('partlist_exp').hide();
                tmp.down('TABLE').update(r.atc_list);
            }
        } else {
            $('msgAtc').hide();
        }

        // Add message information
        if (r.log) {
            this.updateMsgLog(r.log);
        } else {
            $('msgLogInfo').hide();
        }

        // Toggle resume link
        [ $('msg_resume_draft').up() ].invoke(this.isDraft(vs) ? 'show' : 'hide');

        $('messageBody').update(
            (r.msgtext === null)
                ? $('messageBodyError').down().clone(true).show().writeAttribute('id', 'ppane_view_error')
                : r.msgtext
        );
        this.loadingImg('msg', false);
        $('previewInfo').hide();
        $('previewPane').scrollTop = 0;
        pm.show();

        if (r.js) {
            eval(r.js.join(';'));
        }
    },

    _stripAttachmentCallback: function(r)
    {
        // Let the normal viewport refresh code and preview display code
        // handle replacing the current preview. Set preview_replace to
        // prevent a refresh flicker, since viewport refreshing would normally
        // cause the preview pane to be cleared.
        if (DimpCore.inAjaxCallback) {
            this.preview_replace = true;
            this.uid = [ r.response.newuid ];
            this._stripAttachmentCallback.bind(this, r).defer();
            return;
        }

        this.preview_replace = false;

        // Remove old cache value.
        this._expirePPCache([ this._getPPId(r.olduid, r.oldmbox) ]);
    },

    _sendMdnCallback: function(r)
    {
        if (r.response) {
            this._expirePPCache([ this._getPPId(r.response.uid, r.response.mbox) ]);

            if (this.pp &&
                this.pp.imapuid == r.response.uid &&
                this.pp.view == r.response.mbox) {
                this.loadingImg('msg', false);
                $('sendMdnMessage').up(1).fade({ duration: 0.2 });
            }
        }
    },

    // opts = mailbox, uid
    updateMsgLog: function(log, opts)
    {
        var tmp;

        if (!opts ||
            (this.pp &&
             this.pp.imapuid == opts.uid &&
             this.pp.view == opts.mailbox)) {
            $('msgLogInfo').show();

            if (opts) {
                $('msgloglist_col').show();
                $('msgloglist_exp').hide();
            }

            DimpCore.updateMsgLog(log);
        }

        if (opts) {
            tmp = this._getPPId(opts.uid, opts.mailbox);
            if (this.ppcache[tmp]) {
                this.ppcache[tmp].response.log = log;
            }
        }
    },

    initPreviewPane: function()
    {
        var sel = this.viewport.getSelected();
        if (sel.size() != 1) {
            this.clearPreviewPane();
        } else {
            this.loadPreview(sel.get('dataob').first());
        }
    },

    clearPreviewPane: function()
    {
        var sel, txt;

        this.loadingImg('msg', false);
        $('previewMsg').hide();
        $('previewPane').scrollTop = 0;

        sel = this.selectedCount();
        switch (sel) {
        case 0:
            txt = DIMP.text.nomessages;
            break;

        case 1:
            txt = 1 + ' ' + DIMP.text.message;
            break;

        default:
            txt = sel + ' ' + DIMP.text.messages;
            break;
        }
        $('previewInfo').update(txt + ' ' + DIMP.text.selected + '.').show();

        this.pp = null;
    },

    _toggleHeaders: function(elt, update)
    {
        if (update) {
            DIMP.conf.toggle_pref = !DIMP.conf.toggle_pref;
            this._updatePrefs('dimp_toggle_headers', Number(elt.id == 'th_expand'));
        }
        [ elt.up().select('A'), $('msgHeadersColl', 'msgHeaders') ].flatten().invoke('toggle');
    },

    _expirePPCache: function(ids)
    {
        this.ppfifo = this.ppfifo.diff(ids);
        ids.each(function(i) {
            delete this.ppcache[i];
        }, this);

        if (this.ppfifo.size() > this.ppcachesize) {
            delete this.ppcache[this.ppfifo.shift()];
        }
    },

    _getPPId: function(uid, mailbox)
    {
        return uid + '|' + mailbox;
    },

    // mbox = (string)
    getUnseenCount: function(mbox)
    {
        var elt = $(this.getFolderId(mbox));
        return elt ? Number(elt.retrieve('u')) : 0;
    },

    updateUnseenStatus: function(mbox, unseen)
    {
        this.setFolderLabel(mbox, unseen);

        if (this.folder == mbox) {
            this.updateTitle();
        }
    },

    setMessageListTitle: function()
    {
        var range, text,
            rows = this.viewport.getMetaData('total_rows');

        if (rows) {
            range = this.viewport.currentViewableRange();

            if (range.first == 1 && rows == range.last) {
                text = (rows == 1)
                    ? 1 + ' ' + DIMP.text.message
                    : rows + ' ' + DIMP.text.messages;
            } else {
                text = DIMP.text.messagetitle.sub('%d', range.first).sub('%d', range.last).sub('%d', rows);
            }
        } else {
            text = DIMP.text.nomessages;
        }

        $('msgHeader').update(text);
    },

    // f = (string|Element)
    setFolderLabel: function(f, unseen)
    {
        var elt, mbox;

        if (Object.isElement(f)) {
            mbox = f.retrieve('mbox');
            elt = f;
        } else {
            mbox = f;
            elt = $(this.getFolderId(f));
        }

        if (!elt) {
            return;
        }

        if (Object.isUndefined(unseen)) {
            unseen = this.getUnseenCount(mbox);
        } else {
            if (Object.isUndefined(elt.retrieve('u')) ||
                elt.retrieve('u') == unseen) {
                return;
            }

            unseen = Number(unseen);
            elt.store('u', unseen);
        }

        if (mbox == 'INBOX' && window.fluid) {
            window.fluid.setDockBadge(unseen ? unseen : '');
        }

        elt.down('A').update((unseen > 0) ?
            new Element('STRONG').insert(elt.retrieve('l')).insert('&nbsp;').insert(new Element('SPAN', { className: 'count', dir: 'ltr' }).insert('(' + unseen + ')')) :
            elt.retrieve('l'));
    },

    getFolderId: function(f)
    {
        return 'fld' + f.gsub('_', '__').gsub(/\W/, '_');
    },

    getSubFolderId: function(f)
    {
        if (f.endsWith('_special')) {
            f = f.slice(0, -8);
        }
        return 'sub_' + f;
    },

    /* Folder list updates. */

    // search = (boolean) If true, update search results as well.
    poll: function(search)
    {
        var args = {};

        // Reset poll folder counter.
        this.setPoll();

        // Check for label info - it is possible that the mailbox may be
        // loading but not complete yet and sending this request will cause
        // duplicate info to be returned.
        if (this.folder &&
            $('dimpmain_folder').visible() &&
            this.viewport.getMetaData('label')) {
            args = this.viewport.addRequestParams({});
        }

        if (search) {
            args.set('forceUpdate', 1);
        }

        $('checkmaillink').down('A').update('[' + DIMP.text.check + ']');
        DimpCore.doAction('poll', args);
    },

    pollCallback: function(r)
    {
        /* Don't update polled status until the sidebar is visible. Otherwise,
         * preview callbacks may not correctly update unseen status. */
        if (!$('foldersSidebar').visible()) {
            return this.pollCallback.bind(this, r).defer();
        }

        if (r.poll) {
            $H(r.poll).each(function(u) {
                this.updateUnseenStatus(u.key, u.value);
            }, this);
        }

        if (r.quota) {
            this._displayQuota(r.quota);
        }

        $('checkmaillink').down('A').update(DIMP.text.getmail);
    },

    _displayQuota: function(r)
    {
        var q = $('quota').cleanWhitespace();
        $('quota-text').setText(r.m);
        q.down('SPAN.used IMG').writeAttribute('width', 99 - r.p);
    },

    setPoll: function()
    {
        if (DIMP.conf.refresh_time) {
            if (this.pollPE) {
                this.pollPE.stop();
            }
            // Run in anonymous function, or else PeriodicalExecuter passes
            // in itself as first ('force') parameter to poll().
            this.pollPE = new PeriodicalExecuter(function() { this.poll(); }.bind(this), DIMP.conf.refresh_time);
        }
    },

    /* Search functions. */
    isSearch: function(id, qsearch)
    {
        id = id ? id : this.folder;
        return id && id.startsWith(DIMP.conf.searchprefix) && (!qsearch || this.search);
    },

    quicksearchRun: function()
    {
        var q = $F('qsearch_input');

        if (this.isSearch()) {
            /* Search text has changed. */
            if (this.search.query != q) {
                this.folderswitch = true;
            }
            this.viewport.reload();
        } else {
            this.search = {
                label: this.viewport.getMetaData('label'),
                mbox: this.folder,
                qsearch: true,
                query: q
            };
            this.go('mbox', DIMP.conf.qsearchid);
        }
    },

    // 'noload' = (boolean) If true, don't load the mailbox
    quicksearchClear: function(noload)
    {
        var f = this.folder,
            qs = $('qsearch');

        if (!qs) {
            return;
        }

        if (this.isSearch()) {
            this.resetSelected();
            $(qs, 'qsearch_icon', 'qsearch_input').invoke('show');
            if (!noload) {
                this.go('mbox', (this.search ? this.search.mbox : 'INBOX'));
            }
            this.viewport.deleteView(f);
            this.search = null;
        }
    },

    /* Set quicksearch text. */
    _setQsearchText: function()
    {
        $('qsearch_input').writeAttribute('title', DIMP.text.search + ' (' + $('ctx_qsearchby_' + DIMP.conf.qsearchfield).getText() + ')');
        if (this.qsearch_ghost) {
            this.qsearch_ghost.refresh();
        }
    },

    /* Enable/Disable DIMP action buttons as needed. */
    toggleButtons: function()
    {
        DimpCore.toggleButtons($('dimpmain_folder_top').select('DIV.dimpActions A.noselectDisable'), this.selectedCount() == 0);
    },

    /* Drag/Drop handler. */
    folderDropHandler: function(e)
    {
        var dropbase, sel, uids,
            drag = e.memo.element,
            drop = e.element(),
            foldername = drop.retrieve('mbox'),
            ftype = drop.retrieve('ftype');

        if (drag.hasClassName('folder')) {
            dropbase = (drop == $('dropbase'));
            if (dropbase ||
                (ftype != 'special' && !this.isSubfolder(drag, drop))) {
                DimpCore.doAction('renameMailbox', { old_name: drag.retrieve('mbox'), new_parent: dropbase ? '' : foldername, new_name: drag.retrieve('l') }, { callback: this.mailboxCallback.bind(this) });
            }
        } else if (ftype != 'container') {
            sel = this.viewport.getSelected();

            if (sel.size()) {
                // Dragging multiple selected messages.
                uids = sel;
            } else if (drag.retrieve('mbox') != foldername) {
                // Dragging a single unselected message.
                uids = this.viewport.createSelection('domid', drag.id);
            }

            if (uids.size()) {
                if (e.memo.dragevent.ctrlKey) {
                    DimpCore.doAction('copyMessages', this.viewport.addRequestParams({ mboxto: foldername }), { uids: uids });
                } else if (this.folder != foldername) {
                    // Don't allow drag/drop to the current folder.
                    this.updateFlag(uids, DIMP.conf.FLAG_DELETED, true);
                    DimpCore.doAction('moveMessages', this.viewport.addRequestParams({ mboxto: foldername }), { uids: uids });
                }
            }
        }
    },

    dragCaption: function()
    {
        var cnt = this.selectedCount();
        return cnt + ' ' + (cnt == 1 ? DIMP.text.message : DIMP.text.messages);
    },

    onDragMouseDown: function(e)
    {
        var args,
            elt = e.element(),
            id = elt.identify(),
            d = DragDrop.Drags.getDrag(id);

        if (elt.hasClassName('vpRow')) {
            args = { right: e.memo.isRightClick() };
            d.selectIfNoDrag = false;

            // Handle selection first.
            if (DimpCore.DMenu.operaCheck(e)) {
                if (!this.isSelected('domid', id)) {
                    this.msgSelect(id, { right: true });
                }
            } else if (!args.right && (e.memo.ctrlKey || e.memo.metaKey)) {
                this.msgSelect(id, $H({ ctrl: true }).merge(args).toObject());
            } else if (e.memo.shiftKey) {
                this.msgSelect(id, $H({ shift: true }).merge(args).toObject());
            } else if (e.memo.element().hasClassName('msCheck')) {
                this.msgSelect(id, { ctrl: true, right: true });
            } else if (this.isSelected('domid', id)) {
                if (!args.right && this.selectedCount()) {
                    d.selectIfNoDrag = true;
                }
            } else {
                this.msgSelect(id, args);
            }
        } else if (elt.hasClassName('folder')) {
            d.opera = DimpCore.DMenu.operaCheck(e);
        }
    },

    onDrag: function(e)
    {
        if (e.element().hasClassName('folder')) {
            var d = e.memo;
            if (!d.opera && !d.wasDragged) {
                $('folderopts').hide();
                $('dropbase').show();
                d.ghost.removeClassName('on');
            }
        }
    },

    onDragEnd: function(e)
    {
        var elt = e.element(),
            id = elt.identify(),
            d = DragDrop.Drags.getDrag(id);

        if (elt.hasClassName('folder')) {
            if (!d.opera) {
                $('folderopts').show();
                $('dropbase').hide();
            }
        } else if (elt.hasClassName('splitBarVertSidebar')) {
            $('sidebar').setStyle({ width: d.lastCoord[0] + 'px' });
            elt.setStyle({ left: $('sidebar').clientWidth + 'px' });
            $('dimpmain').setStyle({ left: ($('sidebar').clientWidth + elt.clientWidth) + 'px' });
        }
    },

    onDragMouseUp: function(e)
    {
        var elt = e.element(),
            id = elt.identify();

        if (elt.hasClassName('vpRow') &&
            DragDrop.Drags.getDrag(id).selectIfNoDrag) {
            this.msgSelect(id, { right: e.memo.isRightClick() });
        }
    },

    /* Keydown event handler */
    keydownHandler: function(e)
    {
        var all, cnt, co, form, h, need, pp, ps, r, row, rownum, rowoff, sel,
            tmp, vsel, prev,
            elt = e.element(),
            kc = e.keyCode || e.charCode;

        // Only catch keyboard shortcuts in message list view.
        if (!$('dimpmain_folder').visible()) {
            return;
        }

        // Form catching - normally we will ignore, but certain cases we want
        // to catch.
        form = e.findElement('FORM');
        if (form) {
            switch (kc) {
            case Event.KEY_ESC:
            case Event.KEY_TAB:
                // Catch escapes in search box
                if (elt.readAttribute('id') == 'qsearch_input') {
                    if (kc == Event.KEY_ESC || !elt.getValue()) {
                        this.quicksearchClear();
                    }
                    elt.blur();
                    e.stop();
                }
                break;

            case Event.KEY_RETURN:
                if (elt.readAttribute('id') == 'qsearch_input') {
                    if ($F('qsearch_input')) {
                        this.quicksearchRun();
                    } else {
                        this.quicksearchClear();
                    }
                    e.stop();
                }
                break;
            }

            return;
        }

        sel = this.viewport.getSelected();

        switch (kc) {
        case Event.KEY_DELETE:
        case Event.KEY_BACKSPACE:
            if (!this.viewport.getMetaData('nodelete')) {
                r = sel.get('dataob');
                if (e.shiftKey) {
                    this.moveSelected((r.last().VP_rownum == this.viewport.getMetaData('total_rows')) ? (r.first().VP_rownum - 1) : (r.last().VP_rownum + 1), true);
                }
                this.deleteMsg({ vs: sel });
            }
            e.stop();
            break;

        case Event.KEY_UP:
        case Event.KEY_DOWN:
        case Event.KEY_LEFT:
        case Event.KEY_RIGHT:
            prev = kc == Event.KEY_UP || kc == Event.KEY_LEFT;
            if (e.shiftKey && this.lastrow != -1) {
                row = this.viewport.createSelection('rownum', this.lastrow + ((prev) ? -1 : 1));
                if (row.size()) {
                    row = row.get('dataob').first();
                    this.viewport.scrollTo(row.VP_rownum);
                    this.msgSelect(row.VP_domid, { shift: true });
                }
            } else {
                this.moveSelected(prev ? -1 : 1, false, !prev);
            }
            e.stop();
            break;

        case Event.KEY_PAGEUP:
        case Event.KEY_PAGEDOWN:
            if (e.altKey) {
                pp = $('previewPane');
                h = pp.getHeight();
                if (h != pp.scrollHeight) {
                    switch (kc) {
                    case Event.KEY_PAGEUP:
                        pp.scrollTop = Math.max(pp.scrollTop - h + 20, 0);
                        break;

                    case Event.KEY_PAGEDOWN:
                        pp.scrollTop = Math.min(pp.scrollTop + h - 20, pp.scrollHeight - h + 1);
                        break;
                    }
                }
                e.stop();
            } else if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
                ps = this.viewport.getPageSize() - 1;
                move = ps * (kc == Event.KEY_PAGEUP ? -1 : 1);
                if (sel.size() == 1) {
                    co = this.viewport.currentOffset();
                    rowoff = sel.get('rownum').first() - 1;
                    switch (kc) {
                    case Event.KEY_PAGEUP:
                        if (co != rowoff) {
                            move = co - rowoff;
                        }
                        break;

                    case Event.KEY_PAGEDOWN:
                        if ((co + ps) != rowoff) {
                            move = co + ps - rowoff;
                        }
                        break;
                    }
                }
                this.moveSelected(move, false, kc == Event.KEY_PAGEDOWN);
                e.stop();
            }
            break;

        case Event.KEY_HOME:
        case Event.KEY_END:
            this.moveSelected(kc == Event.KEY_HOME ? 1 : this.viewport.getMetaData('total_rows'), true);
            e.stop();
            break;

        case Event.KEY_RETURN:
            if (!elt.match('input')) {
                // Popup message window if single message is selected.
                if (sel.size() == 1) {
                    this.msgWindow(sel.get('dataob').first());
                }
            }
            e.stop();
            break;

        case 65: // A
        case 97: // a
            if (e.ctrlKey) {
                this.selectAll();
                e.stop();
            }
            break;

        case 78: // N
        case 110: // n
            if (e.shiftKey && !this.isSearch(this.folder)) {
                cnt = this.getUnseenCount(this.folder);
                if (Object.isUndefined(cnt) || cnt) {
                    vsel = this.viewport.getSelection();
                    row = vsel.search({ flag: { include: DIMP.conf.FLAG_SEEN } }).get('rownum');
                    all = (vsel.size() == this.viewport.getMetaData('total_rows'));

                    if (all ||
                        (!Object.isUndefined(cnt) && row.size() == cnt)) {
                        // Here we either have the entire mailbox in buffer,
                        // or all unseen messages are in the buffer.
                        if (sel.size()) {
                            tmp = sel.get('rownum').last();
                            if (tmp) {
                                rownum = row.detect(function(r) {
                                    return tmp < r;
                                });
                            }
                        } else {
                            rownum = tmp = row.first();
                        }
                    } else {
                        // Here there is no guarantee that the next unseen
                        // message will appear in the current buffer. Need to
                        // determine if any gaps are between last selected
                        // message and next unseen message in buffer.
                        vsel = vsel.get('rownum');

                        if (sel.size()) {
                            // We know that the selected rows are in the
                            // buffer.
                            tmp = sel.get('rownum').last();
                        } else if (vsel.include(1)) {
                            // If no selected rows, start searching from the
                            // first entry.
                            tmp = 0;
                        } else {
                            // First message is not in current buffer.
                            need = true;
                        }

                        if (!need) {
                            rownum = vsel.detect(function(r) {
                                if (r > tmp) {
                                    if (++tmp != r) {
                                        // We have found a gap.
                                        need = true;
                                        throw $break;
                                    }
                                    return row.include(tmp);
                                }
                            });

                            if (!need && !rownum) {
                                need = (tmp !== this.viewport.getMetaData('total_rows'));
                            }
                        }

                        if (need) {
                            this.viewport.select(null, { search: { unseen: 1 } });
                        }
                    }

                    if (rownum) {
                        this.moveSelected(rownum, true);
                    }
                }
                e.stop();
            }
            break;
        }
    },

    dblclickHandler: function(e)
    {
        if (e.isRightClick()) {
            return;
        }

        var elt = e.element(),
            tmp, tmp2;

        if (!elt.hasClassName('vpRow')) {
            elt = elt.up('.vpRow');
        }

        if (elt) {
            tmp = this.viewport.createSelection('domid', elt.identify());
            tmp2 = tmp.get('dataob').first();

            if (this.isDraft(tmp) && this.viewport.getMetaData('drafts')) {
                DimpCore.compose('resume', { uids: tmp });
            } else {
                this.msgWindow(tmp2);
            }
            e.stop();
        }
    },

    clickHandler: function(parentfunc, e)
    {
        if (e.isRightClick() || DimpCore.DMenu.operaCheck(e)) {
            return;
        }

        var elt = e.element(),
            id, tmp;

        while (Object.isElement(elt)) {
            id = elt.readAttribute('id');

            switch (id) {
            case 'normalfolders':
            case 'specialfolders':
                this._handleFolderMouseClick(e);
                break;

            case 'appportal':
            case 'hometab':
            case 'logolink':
                this.go('portal');
                e.stop();
                return;

            case 'button_compose':
            case 'composelink':
                DimpCore.compose('new');
                e.stop();
                return;

            case 'checkmaillink':
            case 'search_refresh':
                this.poll(id == 'search_refresh');
                e.stop();
                return;

            case 'search_edit':
                this.go('search', {
                    edit_query: 1,
                    mailbox: this.folder.base64urlEncode()
                });
                e.stop();
                return;

            case 'alertsloglink':
                DimpCore.Growler.toggleLog();
                break;

            case 'applyfilterlink':
                if (this.viewport) {
                    this.viewport.reload({ applyfilter: 1 });
                }
                e.stop();
                return;

            case 'appprefs':
                this.go(id.substring(3));
                e.stop();
                return;

            case 'applogout':
                elt.down('A').update('[' + DIMP.text.onlogout + ']');
                DimpCore.logout();
                e.stop();
                return;

            case 'button_forward':
            case 'button_reply':
                this.composeMailbox(id == 'button_reply' ? 'reply_auto' : 'forward_auto');
                break;

            case 'button_resume':
                this.composeMailbox('resume');
                e.stop();
                return;

            case 'button_ham':
            case 'button_spam':
                this.reportSpam(id == 'button_spam');
                e.stop();
                return;

            case 'button_deleted':
                this.deleteMsg();
                e.stop();
                return;

            case 'msglistHeaderHoriz':
                tmp = e.element();
                if (tmp.hasClassName('msCheck')) {
                    this.selectAll();
                } else {
                    this.sort(tmp.retrieve('sortby'));
                }
                e.stop();
                return;

            case 'msglistHeaderVert':
                tmp = e.element();
                if (tmp.hasClassName('msCheck')) {
                    this.selectAll();
                }
                e.stop();
                return;

            case 'th_expand':
            case 'th_collapse':
                this._toggleHeaders(elt, true);
                break;

            case 'msgloglist_toggle':
            case 'partlist_toggle':
                tmp = (id == 'partlist_toggle') ? 'partlist' : 'msgloglist';
                $(tmp + '_col', tmp + '_exp').invoke('toggle');
                Effect.toggle(tmp, 'blind', {
                    duration: 0.2,
                    queue: {
                        position: 'end',
                        scope: tmp,
                        limit: 2
                    }
                });
                break;

            case 'msg_newwin':
            case 'msg_newwin_options':
            case 'ppane_view_error':
                this.msgWindow(this.viewport.getSelection().search({ imapuid: { equal: [ this.pp.imapuid ] } , view: { equal: [ this.pp.view ] } }).get('dataob').first());
                e.stop();
                return;

            case 'msg_view_source':
                DimpCore.popupWindow(DimpCore.addURLParam(DIMP.conf.URI_VIEW, { uid: this.pp.imapuid, mailbox: this.pp.view.base64urlEncode(), actionID: 'view_source', id: 0 }, true), this.pp.imapuid + '|' + this.pp.view);
                break;

            case 'msg_resume_draft':
                this.composeMailbox('resume');
                break;

            case 'sidebar_apps':
                tmp = e.element();
                if (!tmp.hasClassName('custom')) {
                    tmp = tmp.up('LI.custom');
                }
                if (tmp && !tmp.down('A').readAttribute('href')) {
                    // Prefix is 'sidebarapp_'
                    this.go('menu', tmp.down('A').identify().substring(11));
                    e.stop();
                    return;
                }
                break;

            case 'tabbar':
                if (e.element().hasClassName('applicationtab')) {
                    // Prefix is 'apptab_'
                    this.go('menu', e.element().identify().substring(7));
                    e.stop();
                    return;
                }
                break;

            case 'search_close':
                this.quicksearchClear();
                e.stop();
                return;

            case 'helptext_close':
                this.toggleHelp();
                e.stop();
                return;

            case 'send_mdn_link':
                this.loadingImg('msg', true);
                tmp = {};
                tmp[this.pp.view] = [ this.pp.imapuid ];
                DimpCore.doAction('sendMDN', {
                    uid: DimpCore.toRangeString(tmp)
                }, {
                    callback: this._sendMdnCallback.bind(this)
                });
                e.stop();
                return;

            default:
                if (elt.hasClassName('printAtc')) {
                    DimpCore.popupWindow(DimpCore.addURLParam(DIMP.conf.URI_VIEW, { uid: this.pp.imapuid, mailbox: this.pp.view.base64urlEncode(), actionID: 'print_attach', id: elt.readAttribute('mimeid') }, true), this.pp.imapuid + '|' + this.pp.view + '|print', IMP_JS.printWindow);
                    e.stop();
                    return;
                } else if (elt.hasClassName('stripAtc')) {
                    this.loadingImg('msg', true);
                    DimpCore.doAction('stripAttachment', this.viewport.addRequestParams({ id: elt.readAttribute('mimeid') }), { uids: this.viewport.createSelection('dataob', this.pp), callback: this._stripAttachmentCallback.bind(this) });
                    e.stop();
                    return;
                }
            }

            elt = elt.up();
        }

        parentfunc(e);
    },

    mouseoverHandler: function(e)
    {
        if (DragDrop.Drags.drag) {
            var elt = e.element();
            if (elt.hasClassName('exp')) {
                this._toggleSubFolder(elt.up(), 'tog');
            }
        }
    },

    submitFrameHandler: function()
    {
        var sf = $('submit_frame'),
            doc = sf.contentDocument || sf.contentWindow.document,
            r = doc.body.innerHTML.evalJSON(true);

        if (r) {
            if (r.response.action) {
                switch (r.response.action) {
                case 'importMailbox':
                    if (r.response.mbox = this.folder) {
                        this.viewport.reload();
                    }
                    break;
                }
            }

            DimpCore.doActionComplete({ responseJSON: r });
        }
    },

    toggleHelp: function()
    {
        Effect.toggle($('helptext').down('DIV'), 'blind', {
            duration: 0.75,
            queue: {
                position: 'end',
                scope: 'DimpHelp',
                limit: 2
            }
        });
    },

    _mailboxPromptCallback: function(type, params, r)
    {
        if (r.response && params.elt) {
            switch (type) {
            case 'create':
                this._createFolderForm(this._folderAction.bindAsEventListener(this, params.orig_elt, 'createsub'), DIMP.text.createsub_prompt.sub('%s', params.elt.readAttribute('title')));
                break;

            case 'delete':
                this.folderaction = DimpCore.doAction.bind(DimpCore, 'deleteMailbox', { mbox: params.elt.retrieve('mbox') }, { callback: this.mailboxCallback.bind(this) });
                IMPDialog.display({
                    cancel_text: DIMP.text.cancel,
                    noinput: true,
                    ok_text: DIMP.text.ok,
                    text: DIMP.text.delete_folder.sub('%s', params.elt.readAttribute('title'))
                });
                break;

            case 'empty':
                this.folderaction = DimpCore.doAction.bind(DimpCore, 'emptyMailbox', { mbox: params.elt.retrieve('mbox') }, { callback: this._emptyMailboxCallback.bind(this) });
                IMPDialog.display({
                    cancel_text: DIMP.text.cancel,
                    noinput: true,
                    ok_text: DIMP.text.ok,
                    text: DIMP.text.empty_folder.sub('%s', params.elt.readAttribute('title')).sub('%d', r.response)
                });
                break;

            case 'rename':
                this._createFolderForm(this._folderAction.bindAsEventListener(this, params.elt, 'rename'), DIMP.text.rename_prompt.sub('%s', params.elt.readAttribute('title')), params.elt.retrieve('l').unescapeHTML());
                break;
            }
        }
    },

    /* Handle insert folder actions. */
    createBaseFolder: function()
    {
        this._createFolderForm(this._folderAction.bindAsEventListener(this, '', 'create'), DIMP.text.create_prompt);
    },

    _createFolderForm: function(action, text, val)
    {
        this.folderaction = action;
        IMPDialog.display({
            cancel_text: DIMP.text.cancel,
            input_val: val,
            ok_text: DIMP.text.ok,
            text: text
        });
    },

    _folderAction: function(e, folder, mode)
    {
        var action, params, val,
            form = e.findElement('form');
        val = $F(form.down('input'));

        if (val) {
            switch (mode) {
            case 'rename':
                if (folder.retrieve('l') != val) {
                    action = 'renameMailbox';
                    params = {
                        old_name: folder.retrieve('mbox'),
                        new_parent: folder.up().hasClassName('folderlist') ? '' : folder.up(1).previous().retrieve('mbox'),
                        new_name: val
                    };
                }
                break;

            case 'create':
            case 'createsub':
                action = 'createMailbox';
                params = { mbox: val };
                if (mode == 'createsub') {
                    params.parent = folder.up('LI').retrieve('mbox');
                }
                break;
            }

            if (action) {
                DimpCore.doAction(action, params, { callback: this.mailboxCallback.bind(this) });
            }
        }
    },

    /* Mailbox action callback functions. */
    mailboxCallback: function(r)
    {
        r = r.response.mailbox;

        if (r.d) {
            r.d.each(this.deleteFolder.bind(this));
        }
        if (r.c) {
            r.c.each(this.changeFolder.bind(this));
        }
        if (r.a) {
            r.a.each(this.createFolder.bind(this));
        }
    },

    deleteCallback: function(r)
    {
        var search = null, uids = [], vs;

        if (!r.deleted) {
            return;
        }

        this.loadingImg('viewport', false);

        r = r.deleted;
        if (!r.uids || r.mbox != this.folder) {
            return;
        }
        r.uids = DimpCore.parseRangeString(r.uids);

        // Need to convert uid list to listing of unique viewport IDs since
        // we may be dealing with multiple mailboxes (i.e. virtual folders)
        vs = this.viewport.getSelection(this.folder);
        if (vs.getBuffer().getMetaData('search')) {
            $H(r.uids).each(function(pair) {
                pair.value.each(function(v) {
                    uids.push(pair.key + DIMP.conf.IDX_SEP + v);
                });
            });

            search = this.viewport.getSelection().search({ VP_id: { equal: uids } });
        } else {
            r.uids = r.uids[this.folder];
            r.uids.each(function(f, u) {
                uids.push(u + f);
            }.curry(this.folder));
            search = this.viewport.createSelection('uid', r.uids);
        }

        if (r.remove && search.size()) {
            this.viewport.remove(search, { noupdate: r.ViewPort });
            this._expirePPCache(uids);
        }
    },

    _emptyMailboxCallback: function(r)
    {
        if (r.response.mbox) {
            if (this.folder == r.response.mbox) {
                this.viewport.reload();
                this.clearPreviewPane();
            } else {
                this.viewport.deleteView(r.response.mbox);
            }
            this.setFolderLabel(r.response.mbox, 0);
        }
    },

    flagCallback: function(r)
    {
        if (!r.flag) {
            return;
        }

        var sb = this.viewport.createSelectionBuffer();

        r.flag.each(function(entry) {
            $H(DimpCore.parseRangeString(entry.uids)).each(function(m) {
                var s = sb.search({
                    imapuid: { equal: m.value },
                    view: { equal: m.key }
                });

                if (entry.add) {
                    entry.add.each(function(f) {
                        this.updateFlag(s, f, true);
                    }, this);
                }

                if (entry.remove) {
                    entry.remove.each(function(f) {
                        this.updateFlag(s, f, false);
                    }, this);
                }
            }, this);
        }, this);
    },

    _folderLoadCallback: function(r, callback)
    {
        var nf = $('normalfolders');

        if (r.response.expand) {
            this.expandfolder = true;
        }

        this.mailboxCallback(r);

        this.expandfolder = false;

        if (callback) {
            callback();
        }

        if (this.folder) {
            this.highlightSidebar(this.getFolderId(this.folder));
        }

        if ($('foldersLoading').visible()) {
            $('foldersLoading').hide();
            $('foldersSidebar').show();
        }

        if (nf && nf.getStyle('max-height') !== null) {
            this._sizeFolderlist();
        }

        if (r.response.quota) {
            this._displayQuota(r.response.quota);
        }
    },

    _handleFolderMouseClick: function(e)
    {
        var elt = e.element(),
            li = elt.match('LI') ? elt : elt.up('LI');

        if (!li) {
            return;
        }

        if (elt.hasClassName('exp') || elt.hasClassName('col')) {
            this._toggleSubFolder(li, 'tog');
        } else {
            switch (li.retrieve('ftype')) {
            case 'container':
            case 'scontainer':
            case 'vcontainer':
                e.stop();
                break;

            case 'folder':
            case 'special':
            case 'vfolder':
                e.stop();
                return this.go('mbox', li.retrieve('mbox'));
            }
        }
    },

    _toggleSubFolder: function(base, mode, noeffect, noexpand)
    {
        var collapse = [], expand = [], need = [], subs = [];

        if (mode == 'expall' || mode == 'colall') {
            if (base.hasClassName('subfolders')) {
                subs.push(base);
            }
            subs = subs.concat(base.select('.subfolders'));
        } else if (mode == 'exp') {
            // If we are explicitly expanding ('exp'), make sure all parent
            // subfolders are expanded.
            // The last 2 elements of ancestors() are the BODY and HTML tags -
            // don't need to parse through them.
            subs = base.ancestors().slice(0, -2).reverse().findAll(function(n) { return n.hasClassName('subfolders'); });
        } else {
            subs = [ base.next('.subfolders') ];
        }

        if (!subs) {
            return;
        }

        if (mode == 'tog' || mode == 'expall') {
            subs.compact().each(function(s) {
                if (!s.visible() && !s.down().childElements().size()) {
                    need.push(s.previous().retrieve('mbox'));
                }
            });

            if (need.size()) {
                if (mode == 'tog') {
                    base.down('A').update(DIMP.text.loading);
                }
                this._listFolders({
                    all: Number(mode == 'expall'),
                    callback: this._toggleSubFolder.bind(this, base, mode, noeffect, true),
                    mboxes: need
                });
                return;
            } else if (mode == 'tog') {
                // Need to pass element here, since we might be working
                // with 'special' folders.
                this.setFolderLabel(base);
            }
        }

        subs.each(function(s) {
            if (mode == 'tog' ||
                ((mode == 'exp' || mode == 'expall') && !s.visible()) ||
                ((mode == 'col' || mode == 'colall') && s.visible())) {
                s.previous().down().toggleClassName('exp').toggleClassName('col');

                if (mode == 'col' ||
                    ((mode == 'tog') && s.visible())) {
                    collapse.push(s.previous().retrieve('mbox'));
                } else if (!noexpand &&
                           (mode == 'exp' ||
                            ((mode == 'tog') && !s.visible()))) {
                    expand.push(s.previous().retrieve('mbox'));
                }

                if (noeffect) {
                    s.toggle();
                } else {
                    Effect.toggle(s, 'blind', {
                        duration: 0.2,
                        queue: {
                            position: 'end',
                            scope: 'subfolder'
                        }
                    });
                }
            }
        });

        if (DIMP.conf.mbox_expand) {
            if (collapse.size()) {
                DimpCore.doAction('collapseMailboxes', { mboxes: Object.toJSON(collapse) });
            } else if (mode == 'colall') {
                DimpCore.doAction('collapseMailboxes', { all: 1 });
            } else if (expand.size()) {
                DimpCore.doAction('expandMailboxes', { mboxes: Object.toJSON(expand) });
            }
        }
    },

    _listFolders: function(params)
    {
        var cback;

        params = params || {};
        params.unsub = Number(this.showunsub);
        if (!Object.isArray(params.mboxes)) {
            params.mboxes = [ params.mboxes ];
        }
        params.mboxes = Object.toJSON(params.mboxes);

        if (params.callback) {
            cback = function(func, r) { this._folderLoadCallback(r, func); }.bind(this, params.callback);
            delete params.callback;
        } else {
            cback = this._folderLoadCallback.bind(this);
        }

        DimpCore.doAction('listMailboxes', params, { callback: cback });
    },

    // Folder actions.
    // For format of the ob object, see IMP_Dimp::_createFolderElt().
    // If this.expandfolder is set, expand folder list on initial display.
    createFolder: function(ob)
    {
        var div, f_node, ftype, li, ll, parent_e, tmp,
            cname = 'container',
            fid = this.getFolderId(ob.m),
            label = ob.l || ob.m,
            mbox = ob.m,
            submboxid = this.getSubFolderId(fid),
            submbox = $(submboxid),
            title = ob.t || ob.m;

        if ($(fid)) {
            return;
        }

        if (ob.v) {
            ftype = ob.co ? 'vcontainer' : 'vfolder';
            title = label;
        } else if (ob.co) {
            if (ob.n) {
                ftype = 'scontainer';
                title = label;
            } else {
                ftype = 'container';
            }

            /* This is a dummy container element to display child elements of
             * a mailbox displayed in the 'specialfolders' section. */
            if (ob.dummy) {
                fid += '_special';
                cname += ' specialContainer';
            }
        } else {
            cname = 'folder';
            ftype = ob.s ? 'special' : 'folder';
        }

        if (ob.un && this.showunsub) {
            cname += ' unsubFolder';
        }

        div = new Element('SPAN', { className: 'iconImgSidebar' });
        if (ob.i) {
            div.setStyle({ backgroundImage: 'url("' + ob.i + '")' });
        }

        li = new Element('LI', { className: cname, id: fid, title: title }).store('l', label).store('mbox', mbox).insert(div).insert(new Element('A').insert(label));

        // Now walk through the parent <ul> to find the right place to
        // insert the new folder.
        if (submbox) {
            if (submbox.insert({ before: li }).visible()) {
                // If an expanded parent mailbox was deleted, we need to toggle
                // the icon accordingly.
                div.addClassName('col');
            }
        } else {
            div.addClassName(ob.ch ? 'exp' : (ob.cl || 'folderImg'));

            if (ob.s) {
                parent_e = $('specialfolders');

                /* Create a dummy container element in 'normalfolders'
                 * section. */
                if (ob.ch) {
                    div.removeClassName('exp').addClassName(ob.cl || 'folderImg');

                    tmp = Object.clone(ob);
                    tmp.co = tmp.dummy = true;
                    tmp.s = false;
                    this.createFolder(tmp);
                }
            } else {
                parent_e = ob.pa
                    ? $(this.getSubFolderId(this.getFolderId(ob.pa))).down()
                    : $('normalfolders');
            }

            /* Virtual folders are sorted on the server. */
            if (!ob.v) {
                ll = mbox.toLowerCase();
                f_node = parent_e.childElements().find(function(node) {
                    var nodembox = node.retrieve('mbox');
                    return nodembox &&
                           (!ob.s || nodembox != 'INBOX') &&
                           (ll < nodembox.toLowerCase());
                });
            }

            if (f_node) {
                f_node.insert({ before: li });
            } else {
                parent_e.insert(li);
                if (this.expandfolder && !parent_e.hasClassName('folderlist')) {
                    parent_e.up('LI').show().previous().down().removeClassName('exp').addClassName('col');
                }
            }

            // Make sure the sub<mbox> ul is created if necessary.
            if (!ob.s && ob.ch) {
                li.insert({ after: new Element('LI', { className: 'subfolders', id: submboxid }).insert(new Element('UL')).hide() });
                if (tmp) {
                    li.insert({ after: tmp });
                }
            }
        }

        li.store('ftype', ftype);

        // Make the new folder a drop target.
        if (!ob.v) {
            new Drop(li, this._folderDropConfig);
        }

        // Check for unseen messages
        if (ob.po) {
            li.store('u', '');
        }

        switch (ftype) {
        case 'special':
            // For purposes of the contextmenu, treat special folders
            // like regular folders.
            ftype = 'folder';
            // Fall through.

        case 'container':
        case 'folder':
            new Drag(li, this._folderDragConfig);
            break;

        case 'scontainer':
            ftype = 'noactions';
            break;

        case 'vfolder':
            if (ob.v == 1) {
                ftype = 'noactions';
            }
            break;
        }

        DimpCore.addContextMenu({
            id: fid,
            type: ftype
        });
    },

    deleteFolder: function(folder)
    {
        if (this.folder == folder) {
            this.go('mbox', 'INBOX');
        }
        this.deleteFolderElt(this.getFolderId(folder), true);
    },

    changeFolder: function(ob)
    {
        var fdiv, oldexpand,
            fid = this.getFolderId(ob.m);

        if ($(fid + '_special')) {
            // The case of children being added to a special folder is
            // handled by createFolder().
            if (!ob.ch) {
                this.deleteFolderElt(fid + '_special', true);
            }
            return;
        }

        fdiv = $(fid).down('DIV');
        oldexpand = fdiv && fdiv.hasClassName('col');

        this.deleteFolderElt(fid, !ob.ch);
        if (ob.co && this.folder == ob.m) {
            this.go();
        }
        this.createFolder(ob);
        if (ob.ch && oldexpand) {
            fdiv.removeClassName('exp').addClassName('col');
        }
    },

    deleteFolderElt: function(fid, sub)
    {
        var f = $(fid), submbox;
        if (!f) {
            return;
        }

        if (sub) {
            submbox = $(this.getSubFolderId(fid));
            if (submbox) {
                submbox.remove();
            }
        }
        [ DragDrop.Drags.getDrag(fid), DragDrop.Drops.getDrop(fid) ].compact().invoke('destroy');
        this._removeMouseEvents(f);
        if (this.viewport) {
            this.viewport.deleteView(fid);
        }
        f.remove();
    },

    _sizeFolderlist: function()
    {
        var nf = $('normalfolders');
        if (nf) {
            nf.setStyle({ height: (document.viewport.getHeight() - nf.cumulativeOffset()[1]) + 'px' });
        }
    },

    toggleSubscribed: function()
    {
        this.showunsub = !this.showunsub;
        $('ctx_folderopts_sub', 'ctx_folderopts_unsub').invoke('toggle');
        this._reloadFolders();
    },

    _reloadFolders: function()
    {
        $('foldersLoading').show();
        $('foldersSidebar').hide();

        [ $('specialfolders').childElements(), $('dropbase').nextSiblings() ].flatten().each(function(elt) {
            this.deleteFolderElt(elt.readAttribute('id'), true);
        }, this);

        this._listFolders({ reload: 1, mboxes: this.folder });
    },

    subscribeFolder: function(f, sub)
    {
        var fid = this.getFolderId(f);
        DimpCore.doAction('subscribe', { mbox: f, sub: Number(sub) });

        if (this.showunsub) {
            [ $(fid) ].invoke(sub ? 'removeClassName' : 'addClassName', 'unsubFolder');
        } else if (!sub) {
            this.deleteFolderElt(fid);
        }
    },

    /* Flag actions for message list. */
    _getFlagSelection: function(opts)
    {
        var vs;

        if (opts.vs) {
            vs = opts.vs;
        } else if (opts.uid) {
            vs = opts.mailbox
                ? this.viewport.createSelectionBuffer().search({ imapuid: { equal: [ opts.uid ] }, view: { equal: [ opts.mailbox ] } })
                : this.viewport.createSelection('dataob', opts.uid);
        } else {
            vs = this.viewport.getSelected();
        }

        return vs;
    },

    // type = (string) AJAX action type
    // opts = (Object) callback, mailbox, uid
    // args = (Object) Parameters to pass to AJAX call
    _doMsgAction: function(type, opts, args)
    {
        var vs = this._getFlagSelection(opts);

        if (vs.size()) {
            // This needs to be synchronous Ajax if we are calling from a
            // popup window because Mozilla will not correctly call the
            // callback function if the calling window has been closed.
            DimpCore.doAction(type, this.viewport.addRequestParams(args), {
                ajaxopts: { asynchronous: !(opts.uid && opts.mailbox) },
                callback: opts.callback,
                uids: vs
            });
            return vs;
        }

        return false;
    },

    // spam = (boolean) True for spam, false for innocent
    // opts = 'mailbox', 'uid'
    reportSpam: function(spam, opts)
    {
        opts = opts || {};
        opts.callback = this.loadingImg.bind(this, 'viewport', false);

        if (this._doMsgAction('reportSpam', opts, { spam: Number(spam) })) {
            // Indicate to the user that something is happening (since spam
            // reporting may not be instantaneous).
            this.loadingImg('viewport', true);
        }
    },

    // blacklist = (boolean) True for blacklist, false for whitelist
    // opts = 'mailbox', 'uid'
    blacklist: function(blacklist, opts)
    {
        opts = opts || {};
        this._doMsgAction('blacklist', opts, { blacklist: Number(blacklist) });
    },

    // opts = 'mailbox', 'uid'
    deleteMsg: function(opts)
    {
        opts = opts || {};
        opts.vs = this._getFlagSelection(opts);

        this._doMsgAction('deleteMessages', opts, {});
        this.updateFlag(opts.vs, DIMP.conf.FLAG_DELETED, true);
    },

    // flag = (string) IMAP flag name
    // add = (boolean) True to add flag
    // opts = (Object) 'mailbox', 'uid'
    flag: function(flag, add, opts)
    {
        var need,
            vs = this._getFlagSelection(opts || {});

        need = vs.get('dataob').any(function(ob) {
            return add
                ? (!ob.flag || !ob.flag.include(flag))
                : (ob.flag && ob.flag.include(flag));
        });

        if (need) {
            DimpCore.doAction('flagMessages', this.viewport.addRequestParams({
                add: Number(add),
                flags: Object.toJSON([ flag ]),
                view: this.folder
            }), {
                uids: vs
            });
        }
    },

    updateFlag: function(vs, flag, add)
    {
        var s = {};

        vs.get('dataob').each(function(ob) {
            this._updateFlag(ob, flag, add);

            if (this.isSearch()) {
                if (!s[ob.view]) {
                    s[ob.view] = [];
                }
                s[ob.view].push(ob.imapuid);
            }
        }, this);

        /* If this is a search mailbox, also need to update flag in base view,
         * if it is in the buffer. */
        $H(s).each(function(m) {
            var tmp = this.viewport.createSelectionBuffer(m.key).search({ imapuid: { equal: m.value }, view: { equal: m.key } });
            if (tmp.size()) {
                this._updateFlag(tmp.get('dataob').first(), flag, add);
            }
        }, this);
    },

    _updateFlag: function(ob, flag, add)
    {
        ob.flag = ob.flag
            ? ob.flag.without(flag)
            : [];

        if (add) {
            ob.flag.push(flag);
        }

        this.viewport.updateRow(ob);
    },

    isDraft: function(vs)
    {
        return DIMP.conf.resume_all ||
               this.viewport.getMetaData('drafts') ||
               vs.get('dataob').first().flag.include(DIMP.conf.FLAG_DRAFT);
    },

    /* Miscellaneous folder actions. */
    purgeDeleted: function()
    {
        DimpCore.doAction('purgeDeleted', this.viewport.addRequestParams({}));
    },

    modifyPoll: function(folder, add)
    {
        DimpCore.doAction('modifyPoll', { add: Number(add), mbox: folder }, { callback: this._modifyPollCallback.bind(this) });
    },

    _modifyPollCallback: function(r)
    {
        r = r.response;
        var f = r.mbox, fid, p = { response: { poll: {} } };
        fid = $(this.getFolderId(f));

        if (r.add) {
            p.response.poll[f] = r.poll.u;
            fid.store('u', 0);
        } else {
            p.response.poll[f] = 0;
        }

        if (!r.add) {
            fid.store('u', undefined);
            this.updateUnseenStatus(f, 0);
        }
    },

    loadingImg: function(id, show)
    {
        DimpCore.loadingImg(id + 'Loading', id == 'viewport' ? $('msgSplitPane').down('DIV.msglist') : 'previewPane', show);
    },

    // p = (element) Parent element
    // c = (element) Child element
    isSubfolder: function(p, c)
    {
        var sf = $(this.getSubFolderId(p.identify()));
        return sf && c.descendantOf(sf);
    },

    /* Pref updating function. */
    _updatePrefs: function(pref, value)
    {
        DimpCore.doAction('setPrefValue', { pref: pref, value: value });
    },

    /* Onload function. */
    onDomLoad: function()
    {
        DimpCore.init();

        var DM = DimpCore.DMenu, tmp;

        /* Register global handlers now. */
        document.observe('keydown', this.keydownHandler.bindAsEventListener(this));
        IMP_JS.keydownhandler = this.keydownHandler.bind(this);
        document.observe('dblclick', this.dblclickHandler.bindAsEventListener(this));
        Event.observe(window, 'resize', this.onResize.bind(this));

        if (tmp = $('submit_frame')) {
            tmp.observe('load', this.submitFrameHandler.bind(this));
        }

        /* Limit to folders sidebar only. */
        $('foldersSidebar').observe('mouseover', this.mouseoverHandler.bindAsEventListener(this));

        /* Show page now. */
        $('sidebar').setStyle({ width: DIMP.conf.sidebar_width });
        $('dimpLoading').hide();
        $('dimpPage').show();

        /* Create splitbar for sidebar. */
        this.splitbar = new Element('DIV', { className: 'splitBarVertSidebar' }).setStyle({ height: document.viewport.getHeight() + 'px', left: $('sidebar').clientWidth + 'px' });
        $('sidebar').insert({ after: this.splitbar });
        new Drag(this.splitbar, {
            constraint: 'horizontal',
            ghosting: true,
            nodrop: true
        });

        $('dimpmain').setStyle({ left: ($('sidebar').clientWidth + this.splitbar.clientWidth) + 'px' });

        /* Init quicksearch. These needs to occur before loading the message
         * list since it may be disabled if we are in a search mailbox. */
        if ($('qsearch')) {
            this._setQsearchText();
            this.qsearch_ghost = new FormGhost('qsearch_input');

            DimpCore.addContextMenu({
                id: 'qsearch_icon',
                left: true,
                offset: 'qsearch',
                type: 'qsearchopts'
            });
            DimpCore.addContextMenu({
                id: 'qsearch_icon',
                left: false,
                offset: 'qsearch',
                type: 'qsearchopts'
            });
            DM.addSubMenu('ctx_qsearchopts_by', 'ctx_qsearchby');
            DM.addSubMenu('ctx_qsearchopts_filter', 'ctx_filter');
            DM.addSubMenu('ctx_qsearchopts_flag', 'ctx_flag_search');
            DM.addSubMenu('ctx_qsearchopts_flagnot', 'ctx_flag_search');

            /* Create flag entries. */
            DIMP.conf.filters_o.each(function(f) {
                this.contextAddFilter(f, DIMP.conf.filters[f]);
            }, this);

            /* Don't submit FORM. Really only needed for Opera (Bug #9730)
             * but shouldn't hurt otherwise. */
            $('qsearch_input').up('FORM').observe('submit', Event.stop);
        }

        /* Store these text strings for updating purposes. */
        DIMP.text.getmail = $('checkmaillink').down('A').innerHTML;
        DIMP.text.showalog = $('alertsloglink').down('A').innerHTML;

        /* Initialize the starting page. */
        tmp = location.hash;
        if (!tmp.empty() && tmp.startsWith('#')) {
            tmp = (tmp.length == 1) ? "" : tmp.substring(1);
        }

        if (!tmp.empty()) {
            tmp = tmp.base64urlDecode().split(':', 2);
            this.go(tmp[0], tmp[1]);
        } else if (DIMP.conf.initial_page) {
            this.go('mbox', DIMP.conf.initial_page);
        } else {
            this.go();
        }

        /* Create the folder list. Any pending notifications will be caught
         * via the return from this call. */
        this._listFolders({ initial: 1, mboxes: this.folder });

        /* Add popdown menus. Check for disabled compose at the same time. */
        DimpCore.addPopdown('button_other', 'otheractions', true);
        DimpCore.addPopdown('folderopts_link', 'folderopts', true);
        DimpCore.addPopdown('vertical_sort', 'sortopts', true);

        DM.addSubMenu('ctx_message_reply', 'ctx_reply');
        DM.addSubMenu('ctx_message_forward', 'ctx_forward');
        [ 'ctx_message_', 'oa_' ].each(function(i) {
            if ($(i + 'setflag')) {
                DM.addSubMenu(i + 'setflag', 'ctx_flag');
                DM.addSubMenu(i + 'unsetflag', 'ctx_flag');
            }
        });
        DM.addSubMenu('ctx_folder_setflag', 'ctx_folder_flag');
        DM.addSubMenu('ctx_folder_export', 'ctx_folder_export_opts');

        /* Create flag entries. */
        DIMP.conf.flags_o.each(function(f) {
            if (DIMP.conf.flags[f].s) {
                this.contextAddFlag(f, DIMP.conf.flags[f], 'ctx_flag_search');
            }
            if (DIMP.conf.flags[f].a) {
                this.contextAddFlag(f, DIMP.conf.flags[f], 'ctx_flag');
            }
        }, this);

        if (DIMP.conf.disable_compose) {
            $('button_reply', 'button_forward').compact().invoke('up', 'SPAN').concat($('button_compose', 'composelink', 'ctx_contacts_new')).compact().invoke('remove');
        } else {
            DimpCore.addPopdown('button_reply', 'reply', false, true);
            DimpCore.addPopdown('button_forward', 'forward', false, true);
        }

        DimpCore.addContextMenu({
            id: 'msglistHeaderHoriz',
            type: 'mboxsort'
        });

        new Drop('dropbase', this._folderDropConfig);

        if (DIMP.conf.toggle_pref) {
            this._toggleHeaders($('th_expand'));
        }

        /* Remove unavailable menu items. */
        if (!$('GrowlerLog')) {
            $('alertsloglink').remove();
        }

        /* Check for new mail. */
        this.setPoll();
    },

    /* Resize function. */
    onResize: function()
    {
        if (this.resize) {
            clearTimeout(this.resize);
        }

        this.resize = this._onResize.bind(this).delay(0.1);
    },

    _onResize: function()
    {
        this._sizeFolderlist();
        this.splitbar.setStyle({ height: document.viewport.getHeight() + 'px' });
    },

    /* Extend AJAX exception handling. */
    onAjaxException: function(parentfunc, r, e)
    {
        /* Make sure loading images are closed. */
        this.loadingImg('msg', false);
        this.loadingImg('viewport', false);
        DimpCore.showNotifications([ { type: 'horde.error', message: DIMP.text.ajax_error } ]);
        parentfunc(r, e);
    }

};

/* Need to add after DimpBase is defined. */
DimpBase._msgDragConfig = {
    classname: 'msgdrag',
    scroll: 'normalfolders',
    threshold: 5,
    caption: DimpBase.dragCaption.bind(DimpBase)
};

DimpBase._folderDragConfig = {
    classname: 'folderdrag',
    ghosting: true,
    offset: { x: 15, y: 0 },
    scroll: 'normalfolders',
    threshold: 5
};

DimpBase._folderDropConfig = {
    caption: function(drop, drag, e) {
        var m,
            d = drag.retrieve('l'),
            ftype = drop.retrieve('ftype'),
            l = drop.retrieve('l');

        if (drop == $('dropbase')) {
            return DIMP.text.moveto.sub('%s', d).sub('%s', DIMP.text.baselevel);
        }

        switch (e.type) {
        case 'mousemove':
            m = (e.ctrlKey) ? DIMP.text.copyto : DIMP.text.moveto;
            break;

        case 'keydown':
            /* Can't use ctrlKey here since different browsers handle the
             * ctrlKey in different ways when it comes to firing keyboard
             * events. */
            m = (e.keyCode == 17) ? DIMP.text.copyto : DIMP.text.moveto;
            break;

        case 'keyup':
            m = (e.keyCode == 17)
                ? DIMP.text.moveto
                : (e.ctrlKey) ? DIMP.text.copyto : DIMP.text.moveto;
            break;
        }

        if (drag.hasClassName('folder')) {
            return (ftype != 'special' && !DimpBase.isSubfolder(drag, drop)) ? m.sub('%s', d).sub('%s', l) : '';
        }

        return ftype != 'container' ? m.sub('%s', DimpBase.dragCaption()).sub('%s', l) : '';
    },
    keypress: true
};

/* Drag/drop listeners. */
document.observe('DragDrop2:drag', DimpBase.onDrag.bindAsEventListener(DimpBase));
document.observe('DragDrop2:drop', DimpBase.folderDropHandler.bindAsEventListener(DimpBase));
document.observe('DragDrop2:end', DimpBase.onDragEnd.bindAsEventListener(DimpBase));
document.observe('DragDrop2:mousedown', DimpBase.onDragMouseDown.bindAsEventListener(DimpBase));
document.observe('DragDrop2:mouseup', DimpBase.onDragMouseUp.bindAsEventListener(DimpBase));

/* IMPDialog listener. */
document.observe('IMPDialog:onClick', function(e) {
    switch (e.element().identify()) {
    case 'RB_confirm':
        this.folderaction(e.memo);
        break;

    case 'mbox_import':
        e.element().submit();
        break;
    }
}.bindAsEventListener(DimpBase));

/* Route AJAX responses through ViewPort. */
DimpCore.onDoActionComplete = function(r) {
    DimpBase.deleteCallback(r);
    if (DimpBase.viewport) {
        DimpBase.viewport.parseJSONResponse(r);
    }
    DimpBase.flagCallback(r);
    DimpBase.pollCallback(r);
};

/* Click handler. */
DimpCore.clickHandler = DimpCore.clickHandler.wrap(DimpBase.clickHandler.bind(DimpBase));

/* ContextSensitive handlers. */
DimpCore.contextOnClick = DimpCore.contextOnClick.wrap(DimpBase.contextOnClick.bind(DimpBase));
DimpCore.contextOnShow = DimpCore.contextOnShow.wrap(DimpBase.contextOnShow.bind(DimpBase));

/* Extend AJAX exception handling. */
DimpCore.doActionOpts.onException = DimpCore.doActionOpts.onException.wrap(DimpBase.onAjaxException.bind(DimpBase));

/* Initialize onload handler. */
document.observe('dom:loaded', DimpBase.onDomLoad.bind(DimpBase));
